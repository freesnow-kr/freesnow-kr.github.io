// 아주 작은 엑셀(.xlsx) 만들기 — 의존성 없이 브라우저에서 (사용자 요구 2026-10-23: 조 편성 내려받기에 조장, 운영진 색이 필요해서 CSV 말고 xlsx)
// 시트 하나, 글자 칸만(inline string), 칸마다 굵게, 글자색, 바탕색. 압축 없는 zip(store)이라 파일은 조금 크지만 수백 칸이면 몇 KB
export type Cell = { v: string; bold?: boolean; color?: string; fill?: string } | string | null; // color, fill = 'RRGGBB'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const col = (i: number) => (i >= 26 ? String.fromCharCode(64 + Math.floor(i / 26)) : '') + String.fromCharCode(65 + (i % 26));

export function xlsx(rows: Cell[][], opts: { widths?: number[]; sheet?: string } = {}): Blob {
	// 칸 모양 → 스타일 번호 (같은 모양은 하나로)
	const fonts = ['<font><sz val="11"/><name val="맑은 고딕"/></font>'];
	const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
	const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
	const styleOf = new Map<string, number>();
	const style = (c: Exclude<Cell, string | null>) => {
		const key = `${c.bold ? 1 : 0}|${c.color ?? ''}|${c.fill ?? ''}`;
		if (key === '0||') return 0;
		if (!styleOf.has(key)) {
			fonts.push(`<font>${c.bold ? '<b/>' : ''}<sz val="11"/>${c.color ? `<color rgb="FF${c.color}"/>` : ''}<name val="맑은 고딕"/></font>`);
			let fillId = 0;
			if (c.fill) fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="FF${c.fill}"/><bgColor indexed="64"/></patternFill></fill>`), (fillId = fills.length - 1);
			xfs.push(`<xf numFmtId="0" fontId="${fonts.length - 1}" fillId="${fillId}" borderId="0" xfId="0" applyFont="1"${fillId ? ' applyFill="1"' : ''}/>`);
			styleOf.set(key, xfs.length - 1);
		}
		return styleOf.get(key)!;
	};
	const data = rows
		.map((row, r) => {
			const cells = row
				.map((c, i) => {
					if (c === null || c === '') return '';
					const cell = typeof c === 'string' ? { v: c } : c;
					const s = style(cell);
					return `<c r="${col(i)}${r + 1}" t="inlineStr"${s ? ` s="${s}"` : ''}><is><t xml:space="preserve">${esc(cell.v)}</t></is></c>`;
				})
				.join('');
			return `<row r="${r + 1}">${cells}</row>`;
		})
		.join('');
	const cols = opts.widths?.length ? `<cols>${opts.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
	const ns = 'http://schemas.openxmlformats.org';
	const files: [string, string][] = [
		['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
		['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
		['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${ns}/spreadsheetml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><sheets><sheet name="${esc((opts.sheet ?? 'Sheet1').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
		['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${ns}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
		['xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${ns}/spreadsheetml/2006/main">${cols}<sheetData>${data}</sheetData></worksheet>`],
		['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${ns}/spreadsheetml/2006/main"><fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
	];
	return new Blob([zip(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// 압축 없는 zip (파일 이름 UTF-8)
const crcTable = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});
const crc32 = (b: Uint8Array) => {
	let c = 0xffffffff;
	for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
};
function zip(files: [string, string][]) {
	const enc = new TextEncoder();
	const parts: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;
	for (const [name, text] of files) {
		const n = enc.encode(name), body = enc.encode(text), crc = crc32(body);
		const head = (sig: number, extra: number) => {
			const h = new DataView(new ArrayBuffer(extra));
			h.setUint32(0, sig, true);
			return h;
		};
		const local = head(0x04034b50, 30);
		[[4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, 0, 2], [12, 0x21, 2], [14, crc, 4], [18, body.length, 4], [22, body.length, 4], [26, n.length, 2], [28, 0, 2]].forEach(([at, v, size]) => (size === 2 ? local.setUint16(at, v, true) : local.setUint32(at, v, true)));
		const cen = head(0x02014b50, 46);
		[[4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, 0, 2], [14, 0x21, 2], [16, crc, 4], [20, body.length, 4], [24, body.length, 4], [28, n.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]].forEach(([at, v, size]) => (size === 2 ? cen.setUint16(at, v, true) : cen.setUint32(at, v, true)));
		parts.push(new Uint8Array(local.buffer), n, body);
		central.push(new Uint8Array(cen.buffer), n);
		offset += 30 + n.length + body.length;
	}
	const size = central.reduce((a, b) => a + b.length, 0);
	const end = new DataView(new ArrayBuffer(22));
	end.setUint32(0, 0x06054b50, true);
	end.setUint16(8, files.length, true);
	end.setUint16(10, files.length, true);
	end.setUint32(12, size, true);
	end.setUint32(16, offset, true);
	return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[]);
}

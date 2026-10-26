// 공용 선택 창 (사용자 요구 2026-10-26: 휴대폰에서 select, datalist가 불편 → 운영진 화면에서 만든 창을 모든 페이지 공통으로)
// - pick(): 직접 불러 쓰는 창 (운영진 화면의 회원 고르기, ⋯ 메뉴 등). 휴대폰은 아래에서 올라오는 시트, 넓으면 가운데 창
// - 터치 기기(휴대폰, 태블릿)에서는 모든 <select>를 누르면 기본 휠 대신 이 창 → 고르면 select 값을 바꾸고 change 이벤트
//   (select는 그대로라 각 페이지 코드는 손댈 필요 없음. ride.css가 터치 기기에서 select를 눌러도 기본 창이 안 뜨게 pointer-events: none)
//   마우스 화면은 기본 select 그대로. 스크린리더로 select를 직접 열면 기본 창(그대로 동작)
export type PickOpt = { label: string; value: string; sub?: string; group?: string; selected?: boolean };

let dlg: HTMLDialogElement | null = null;
function sheet() {
	if (dlg) return dlg;
	dlg = document.createElement('dialog');
	dlg.className = 'picker';
	dlg.tabIndex = -1; // 열 때 첫 항목 대신 창에 포커스 (첫 줄이 고른 것처럼 칠해지고 주황 테두리가 생기던 문제)
	dlg.innerHTML = `<form method="dialog" class="picker-box"><p class="picker-title"></p><input class="picker-find" type="search" placeholder="찾기" autocomplete="off" /><ul class="picker-list"></ul><button class="picker-close" value="">닫기</button></form>`;
	dlg.addEventListener('click', (e) => e.target === dlg && dlg!.close('')); // 바깥 누르면 닫기
	document.body.append(dlg);
	return dlg;
}

// 고르면 그 value, 닫으면 null. 항목이 많으면 위에 찾기 칸. group이 바뀌는 곳에 소제목
export function pick(title: string, opts: PickOpt[], search = opts.length > 12): Promise<string | null> {
	const d = sheet();
	const find = d.querySelector<HTMLInputElement>('.picker-find')!;
	const list = d.querySelector<HTMLUListElement>('.picker-list')!;
	d.querySelector('.picker-title')!.textContent = title;
	find.hidden = !search;
	find.value = '';
	const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text: string) => Object.assign(document.createElement(tag), { className: cls, textContent: text });
	const draw = () => {
		const q = find.value.trim();
		const shown = opts.filter((o) => !q || `${o.label} ${o.sub ?? ''}`.includes(q));
		const items: HTMLLIElement[] = [];
		shown.forEach((o, i) => {
			if (o.group && o.group !== shown[i - 1]?.group) items.push(el('li', 'picker-group', o.group));
			const b = el('button', o.selected ? 'on' : '', '');
			b.value = o.value;
			b.append(el('b', '', o.label));
			if (o.sub) b.append(el('small', '', o.sub));
			const li = document.createElement('li');
			li.append(b);
			items.push(li);
		});
		list.replaceChildren(...(items.length ? items : [el('li', 'picker-empty', '찾는 항목이 없어요.')]));
	};
	find.oninput = draw;
	draw();
	d.returnValue = '';
	d.showModal();
	if (search && matchMedia('(hover: hover)').matches) find.focus(); // 휴대폰에선 키보드가 목록을 가리지 않게 자동 포커스 안 함
	else d.focus();
	list.querySelector<HTMLElement>('.on')?.scrollIntoView({ block: 'center' }); // 지금 고른 것이 보이게
	return new Promise((res) => d.addEventListener('close', () => res(d.returnValue || null), { once: true }));
}

// select → 선택 창 항목 (숨김, 잠긴 선택지 빼고, 필수 칸의 빈 값 '시도' 같은 안내 줄도 뺌, optgroup은 소제목)
function optionsOf(s: HTMLSelectElement): PickOpt[] {
	return [...s.options]
		.filter((o) => !o.disabled && !o.hidden && !(s.required && o.value === ''))
		.map((o) => ({ label: o.label || o.text, value: o.value, group: o.parentElement instanceof HTMLOptGroupElement ? o.parentElement.label : undefined, selected: o.selected }));
}
function titleOf(s: HTMLSelectElement) {
	if (s.ariaLabel) return s.ariaLabel;
	const label = s.closest('label') ?? (s.id ? document.querySelector(`label[for="${s.id}"]`) : null);
	return label ? [...label.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent!.trim()).join(' ') : '';
}

const touch = matchMedia('(hover: none) and (pointer: coarse)');
// 터치 기기: select는 pointer-events: none이라 누른 자리 아래의 select를 위치로 찾음
const selectAt = (x: number, y: number) =>
	[...document.querySelectorAll<HTMLSelectElement>('select:not([multiple])')].find((s) => {
		if (s.disabled) return false;
		const r = s.getBoundingClientRect();
		return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
	});
// 열기는 pointerup으로 (아이폰 Safari는 버튼, 링크가 아닌 곳을 누르면 문서 전체 click이 안 오는 경우가 있어서).
// 화면을 밀어 스크롤하면 pointerup 대신 pointercancel이 와서 안 열림
document.addEventListener('pointerup', async (e) => {
	if (!touch.matches || e.pointerType === 'mouse' || dlg?.open) return;
	const s = selectAt(e.clientX, e.clientY);
	if (!s) return;
	const v = await pick(titleOf(s), optionsOf(s));
	if (v === null || v === s.value) return;
	s.value = v;
	s.dispatchEvent(new Event('input', { bubbles: true }));
	s.dispatchEvent(new Event('change', { bubbles: true }));
});
// 같은 자리의 click은 막음 (select를 감싼 label이 눌려서 기본 휠이 뜨지 않게)
document.addEventListener(
	'click',
	(e) => {
		if (touch.matches && selectAt(e.clientX, e.clientY)) e.preventDefault(), e.stopPropagation();
	},
	true,
);

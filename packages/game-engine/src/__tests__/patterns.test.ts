import { describe, expect, it } from 'vitest';
import { recognize } from '../patterns.js';
import { j, n, wild } from './helpers.js';

const L = '2'; // 级牌固定为 2，用于不涉及级牌互动的用例
const L5 = '5'; // 级牌 = 5，用于百搭/级牌牌力测试

describe('recognize / single', () => {
  it('普通单张', () => {
    const p = recognize([n('S', '7')], L);
    expect(p?.kind).toBe('single');
    expect(p?.primaryWeight).toBe(7);
  });
  it('级牌单张权值为 15', () => {
    const p = recognize([n('D', '5')], L5);
    expect(p?.kind).toBe('single');
    expect(p?.primaryWeight).toBe(15);
  });
  it('大王单张权值 17', () => {
    const p = recognize([j('red')], L);
    expect(p?.primaryWeight).toBe(17);
  });
});

describe('recognize / pair', () => {
  it('普通对子', () => {
    const p = recognize([n('S', '9'), n('H', '9')], L);
    expect(p?.kind).toBe('pair');
    expect(p?.primaryWeight).toBe(9);
  });
  it('百搭 + 普通牌 = 对子', () => {
    const p = recognize([wild(L5), n('S', '8')], L5);
    expect(p?.kind).toBe('pair');
    expect(p?.primaryWeight).toBe(8);
  });
  it('双百搭 = 级牌对', () => {
    const p = recognize([wild(L5, 0), wild(L5, 1)], L5);
    expect(p?.kind).toBe('pair');
    expect(p?.primaryWeight).toBe(15);
  });
  it('王对（同色双小王）', () => {
    const p = recognize([j('black', 0), j('black', 1)], L);
    expect(p?.kind).toBe('pair');
    expect(p?.primaryWeight).toBe(16);
  });
  it('王 + 百搭 不成对', () => {
    expect(recognize([j('red'), wild(L5)], L5)).toBeNull();
  });
  it('混点对子非法', () => {
    expect(recognize([n('S', '3'), n('H', '4')], L)).toBeNull();
  });
});

describe('recognize / triple', () => {
  it('三张', () => {
    const p = recognize([n('S', 'K'), n('H', 'K'), n('D', 'K')], L);
    expect(p?.kind).toBe('triple');
    expect(p?.primaryWeight).toBe(13);
  });
  it('百搭 + 两张同点 = 三张', () => {
    const p = recognize([wild(L5), n('S', '9'), n('D', '9')], L5);
    expect(p?.kind).toBe('triple');
    expect(p?.primaryWeight).toBe(9);
  });
});

describe('recognize / triple-pair (三带二)', () => {
  it('基本三带二', () => {
    const p = recognize(
      [n('S', '7'), n('H', '7'), n('D', '7'), n('S', '9'), n('H', '9')],
      L,
    );
    expect(p?.kind).toBe('triple-pair');
    expect(p?.primaryWeight).toBe(7);
  });
  it('百搭补三张', () => {
    const p = recognize(
      [wild(L5), n('S', '7'), n('H', '7'), n('S', '9'), n('D', '9')],
      L5,
    );
    expect(p?.kind).toBe('triple-pair');
    expect(p?.primaryWeight).toBe(7);
  });
});

describe('recognize / straight (顺子)', () => {
  it('3-4-5-6-7', () => {
    const p = recognize(
      [n('S', '3'), n('H', '4'), n('D', '5'), n('C', '6'), n('S', '7')],
      L,
    );
    expect(p?.kind).toBe('straight');
    expect(p?.primaryWeight).toBe(7);
  });
  it('A-2-3-4-5（A 当 1）', () => {
    const p = recognize(
      [n('S', 'A'), n('H', '2'), n('D', '3'), n('C', '4'), n('S', '5')],
      '7', // 级牌 7，不干扰
    );
    expect(p?.kind).toBe('straight');
    expect(p?.primaryWeight).toBe(5);
  });
  it('10-J-Q-K-A', () => {
    const p = recognize(
      [n('S', '10'), n('H', 'J'), n('D', 'Q'), n('C', 'K'), n('S', 'A')],
      '7',
    );
    expect(p?.kind).toBe('straight');
    expect(p?.primaryWeight).toBe(14);
  });
  it('百搭补断', () => {
    const p = recognize(
      [n('S', '3'), wild('5'), n('D', '5'), n('C', '6'), n('S', '7')],
      '5',
    );
    expect(p?.kind).toBe('straight');
    expect(p?.primaryWeight).toBe(7);
  });
  it('含王非顺子', () => {
    expect(
      recognize(
        [n('S', '3'), n('H', '4'), n('D', '5'), n('C', '6'), j('black')],
        L,
      ),
    ).toBeNull();
  });
  it('Q-K-A-2-3 非法（不可跨 A→2）', () => {
    expect(
      recognize(
        [n('S', 'Q'), n('H', 'K'), n('D', 'A'), n('C', '2'), n('S', '3')],
        '7',
      ),
    ).toBeNull();
  });
});

describe('recognize / pair-chain (连对)', () => {
  it('334455', () => {
    const p = recognize(
      [
        n('S', '3'), n('H', '3'),
        n('D', '4'), n('C', '4'),
        n('S', '5'), n('H', '5'),
      ],
      '7',
    );
    expect(p?.kind).toBe('pair-chain');
    expect(p?.primaryWeight).toBe(5);
  });
  it('百搭补对', () => {
    const p = recognize(
      [
        n('S', '3'), n('H', '3'),
        n('D', '4'), wild('7'),
        n('S', '5'), n('H', '5'),
      ],
      '7',
    );
    expect(p?.kind).toBe('pair-chain');
    expect(p?.primaryWeight).toBe(5);
  });
});

describe('recognize / plate (钢板)', () => {
  it('555666', () => {
    const p = recognize(
      [
        n('S', '5'), n('H', '5'), n('D', '5'),
        n('S', '6'), n('H', '6'), n('D', '6'),
      ],
      '7',
    );
    expect(p?.kind).toBe('plate');
    expect(p?.primaryWeight).toBe(6);
  });
});

describe('recognize / bomb', () => {
  it('4 张炸弹', () => {
    const p = recognize(
      [n('S', '9'), n('H', '9'), n('D', '9'), n('C', '9')],
      '7',
    );
    expect(p?.kind).toBe('bomb');
    expect(p?.length).toBe(4);
    expect(p?.primaryWeight).toBe(9);
  });
  it('5 张炸弹（百搭参与）', () => {
    const p = recognize(
      [n('S', '9'), n('H', '9'), n('D', '9'), n('C', '9'), wild('5')],
      '5',
    );
    expect(p?.kind).toBe('bomb');
    expect(p?.length).toBe(5);
  });
  it('6 张炸弹', () => {
    const p = recognize(
      [
        n('S', '9', 0), n('H', '9', 0), n('D', '9', 0), n('C', '9', 0),
        n('S', '9', 1), n('H', '9', 1),
      ],
      '7',
    );
    expect(p?.length).toBe(6);
  });
});

describe('recognize / straight-flush', () => {
  it('同花顺 3♠-4♠-5♠-6♠-7♠', () => {
    const p = recognize(
      [
        n('S', '3'), n('S', '4'), n('S', '5'), n('S', '6'), n('S', '7'),
      ],
      'A',
    );
    expect(p?.kind).toBe('straight-flush');
    expect(p?.primaryWeight).toBe(7);
  });
  it('百搭可补，但真牌必须同花', () => {
    const p = recognize(
      [n('S', '3'), n('S', '4'), wild('A'), n('S', '6'), n('S', '7')],
      'A',
    );
    expect(p?.kind).toBe('straight-flush');
  });
  it('非同花 → 退化为普通顺子', () => {
    const p = recognize(
      [n('S', '3'), n('H', '4'), n('D', '5'), n('C', '6'), n('S', '7')],
      'A',
    );
    expect(p?.kind).toBe('straight');
  });
});

describe('recognize / rocket', () => {
  it('双王炸', () => {
    const p = recognize(
      [j('black', 0), j('black', 1), j('red', 0), j('red', 1)],
      '7',
    );
    expect(p?.kind).toBe('rocket');
  });
  it('3 王不构成王炸', () => {
    expect(
      recognize([j('black', 0), j('black', 1), j('red', 0)], '7'),
    ).toBeNull();
  });
});

describe('recognize / 无效输入', () => {
  it('空数组', () => {
    expect(recognize([], '7')).toBeNull();
  });
  it('混乱 5 张', () => {
    expect(
      recognize(
        [n('S', '3'), n('H', '7'), n('D', '9'), n('C', 'J'), n('S', 'K')],
        '4',
      ),
    ).toBeNull();
  });
});

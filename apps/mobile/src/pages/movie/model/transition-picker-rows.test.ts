import { transitionPickerRows } from './transition-picker-rows';

const pick = (owner: 'ai' | 'user', kind: 'crossfade' | 'dip' | 'flash', durationMs = 500) => ({
  kind,
  durationMs,
  owner,
  toSnapId: 's2',
});

function selectedRow(rows: ReturnType<typeof transitionPickerRows>) {
  return rows.find((row) => row.selected);
}

describe('transitionPickerRows', () => {
  it('lists 자동으로 고르기 first, then every transition', () => {
    expect(transitionPickerRows(undefined, undefined).map((row) => row.kind)).toEqual([
      undefined,
      'hardcut',
      'crossfade',
      'dip',
      'flash',
      'zoompunch',
    ]);
  });

  it('selects 자동으로 고르기 for the automatic pick and names what it is', () => {
    const rows = transitionPickerRows(pick('ai', 'crossfade'), 'crossfade');
    // expect(selectedRow(rows)).toMatchObject({ kind: undefined, note: '지금 겹쳐 녹이기' });
    expect(selectedRow(rows)).toMatchObject({
      kind: undefined,
      note: '\uC9C0\uAE08 \uACB9\uCCD0 \uB179\uC774\uAE30',
    });
  });

  it('reads a boundary not picked yet as being picked', () => {
    expect(selectedRow(transitionPickerRows(undefined, undefined))).toMatchObject({
      kind: undefined,
      // note: '고르는 중',
      note: '\uACE0\uB974\uB294 \uC911',
    });
  });

  it("selects the user's pick and leaves 자동으로 고르기 without a read-out", () => {
    const rows = transitionPickerRows(pick('user', 'flash', 200), 'flash');
    expect(selectedRow(rows)).toMatchObject({ kind: 'flash', note: undefined });
    expect(rows[0].note).toBeUndefined();
  });

  it('says what a pick that does not fit will look like, on whichever row is selected', () => {
    expect(selectedRow(transitionPickerRows(pick('user', 'crossfade'), 'dip'))?.note).toBe(
      // '검게 넘기기로 보여요',
      '\uAC80\uAC8C \uB118\uAE30\uAE30\uB85C \uBCF4\uC5EC\uC694',
    );
    expect(selectedRow(transitionPickerRows(pick('ai', 'crossfade', 800), 'dip'))?.note).toBe(
      // '검게 넘기기로 보여요',
      '\uAC80\uAC8C \uB118\uAE30\uAE30\uB85C \uBCF4\uC5EC\uC694',
    );
  });
});

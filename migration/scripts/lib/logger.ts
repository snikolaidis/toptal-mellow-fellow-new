const t0 = Date.now();

function ts(): string {
  const s = Math.floor((Date.now() - t0) / 1000);
  const m = Math.floor(s / 60);
  return `+${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export const log = {
  info: (msg: string) => console.log(`${ts()} ${msg}`),
  ok: (msg: string) => console.log(`${ts()} OK  ${msg}`),
  warn: (msg: string) => console.warn(`${ts()} WARN ${msg}`),
  err: (msg: string, e?: unknown) => {
    console.error(`${ts()} ERR ${msg}`);
    if (e) console.error(e);
  },
  step: (msg: string) => console.log(`\n${ts()} ===== ${msg} =====`),
};

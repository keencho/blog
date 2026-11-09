// 빌드 서버가 UTC 여도 한국 시간 기준으로 끊는다
const KST = 'Asia/Seoul';

const parts = (d: Date) => {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => f.find((p) => p.type === t)!.value;
  return { y: get('year'), m: get('month'), d: get('day') };
};

export const year = (d: Date) => Number(parts(d).y);
export const monthDay = (d: Date) => `${parts(d).m}.${parts(d).d}`;
export const full = (d: Date) => {
  const { y, m, d: day } = parts(d);
  return `${y}년 ${Number(m)}월 ${Number(day)}일`;
};
export const iso = (d: Date) => {
  const { y, m, d: day } = parts(d);
  return `${y}-${m}-${day}`;
};

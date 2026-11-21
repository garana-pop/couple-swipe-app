import { Question, SwipeDirection } from '../types';

export const TODAY_QUESTIONS: Question[] = [
  {
    id: 'q1',
    category: '暮らし・価値観',
    title: 'どっちが家事に厳しい？',
    choices: {
      UP: '絶対に私',
      DOWN: '確実に相手',
      LEFT: 'どちらも同じくらい',
      RIGHT: 'どちらもゆるい',
    },
    repeatBadge: '90日ぶりの質問',
    pastHistory: {
      date: '3ヶ月前 (8月21日)',
      myAnswer: 'UP',
      partnerAnswer: 'UP',
      note: '前回はお互いに「自分が厳しい」と回答していました',
    },
  },
  {
    id: 'q2',
    category: '休日の過ごし方',
    title: '理想の休日はどう過ごしたい？',
    choices: {
      UP: 'アクティブにお出かけ',
      DOWN: '家で一日中のんびり',
      LEFT: '各自好きなことする',
      RIGHT: '友達も交えてワイワイ',
    },
    repeatBadge: '半年ぶりの質問',
    pastHistory: {
      date: '6ヶ月前 (5月18日)',
      myAnswer: 'UP',
      partnerAnswer: 'DOWN',
      note: '前回は外出派とインドア派で回答が分かれていました',
    },
  },
  {
    id: 'q3',
    category: '記念日・イベント',
    title: '記念日や誕生日の過ごし方は？',
    choices: {
      UP: '全力でサプライズしたい',
      DOWN: '事前に相談して決めたい',
      LEFT: '美味しいご飯があれば十分',
      RIGHT: '自然体でいつも通りがいい',
    },
    // 初回出題
  },
];

// 相手（パートナー）のシミュレート回答
export const DUMMY_PARTNER_ANSWERS: Record<string, SwipeDirection> = {
  q1: 'DOWN', // 「確実に相手」
  q2: 'DOWN', // 「家で一日中のんびり」
  q3: 'DOWN', // 「事前に相談して決めたい」
};

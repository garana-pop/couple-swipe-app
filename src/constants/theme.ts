import { SwipeDirection } from '../types';

export const COLORS = {
  primary: '#E06D53',      // 温かみのあるテラコッタコーラル
  primaryLight: '#FDF1EC',
  primaryDark: '#C85338',
  secondary: '#F2A07E',    // ほっこりアプリコット
  background: '#FAF6F0',   // やわらかなリネン・ラテベージュ
  card: '#FFFFFF',
  text: '#2D2522',         // 温かみのあるダークブラウン
  textMuted: '#7D716A',    // ウォームトープ
  textLight: '#B0A59E',
  border: '#EFE7DE',
  surface: '#F4ECE4',

  // 4方向のカラー（落ち着きと温もりのあるアース＆パステルトーン）
  directions: {
    UP: {
      color: '#4A7C59',      // セージグリーン
      bg: '#F2F7F4',
      border: '#C8E2D1',
      shadow: 'rgba(74, 124, 89, 0.25)',
      label: '上へスワイプ',
    },
    DOWN: {
      color: '#D45D6E',      // ダスティローズ
      bg: '#FDF2F4',
      border: '#F8CBD2',
      shadow: 'rgba(212, 93, 110, 0.25)',
      label: '下へスワイプ',
    },
    LEFT: {
      color: '#4D779E',      // スモーキーブルー
      bg: '#F1F6F9',
      border: '#CBE0ED',
      shadow: 'rgba(77, 119, 158, 0.25)',
      label: '左へスワイプ',
    },
    RIGHT: {
      color: '#C97A2B',      // ハニーアンバー
      bg: '#FDF6EE',
      border: '#F7DEC1',
      shadow: 'rgba(201, 122, 43, 0.25)',
      label: '右へスワイプ',
    },
  } as Record<SwipeDirection, { color: string; bg: string; border: string; shadow: string; label: string }>,
};

export const SHADOWS = {
  card: {
    shadowColor: '#8E6E5D',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  cardSmall: {
    shadowColor: '#8E6E5D',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  cardFloating: {
    shadowColor: '#6B4E3D',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 8,
  },
  // 選択肢エリアの奥行き・立体感シャドウ
  depthSlot: {
    shadowColor: '#785A48',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 10,
    elevation: 3,
  },
  depthSlotActive: {
    shadowColor: '#523A2C',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 7,
  },
};

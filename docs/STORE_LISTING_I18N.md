# Kotaeai 多言語ストア掲載情報キット（全8言語・コピペ対応）

Google Play Console（メインのストア掲載情報・定期購入の翻訳・リリースノート・フィーチャーグラフィック）および App Store Connect へそのまま貼り付けられる全8言語分のテキストと素材パスをまとめています。

> すべての文字数制限は `npm run check:store-i18n` で自動検証済みです。ソースデータは `store-assets/i18n/locales/*.json` で一元管理しています。

---

## 0. 対応言語コード一覧 ＆ 素材ファイル対応表

| 言語 | Google Play 言語コード | App Store 言語コード | フィーチャーグラフィック (`1024×500`) | プライバシーポリシー URL |
|---|---|---|---|---|
| 日本語（デフォルト） | `ja-JP` | `ja` | `store-assets/google-play/feature-graphic-1024x500.png` | `https://garana-pop.github.io/couple-swipe-app/privacy.html` |
| 英語（アメリカ） | `en-US` | `en-US` | `store-assets/google-play/localized/en-US/feature-graphic-1024x500.png` | `https://garana-pop.github.io/couple-swipe-app/en/privacy.html` |
| フランス語（フランス） | `fr-FR` | `fr-FR` | `store-assets/google-play/localized/fr-FR/feature-graphic-1024x500.png` | `https://garana-pop.github.io/couple-swipe-app/en/privacy.html` |
| 韓国語 | `ko-KR` | `ko` | `store-assets/google-play/localized/ko-KR/feature-graphic-1024x500.png` | `https://garana-pop.github.io/couple-swipe-app/en/privacy.html` |
| ロシア語 | `ru-RU` | `ru` | `store-assets/google-play/localized/ru-RU/feature-graphic-1024x500.png` | `https://garana-pop.github.io/couple-swipe-app/en/privacy.html` |
| タイ語 | `th` | `th` | `store-assets/google-play/localized/th/feature-graphic-1024x500.png` | `https://garana-pop.github.io/couple-swipe-app/en/privacy.html` |
| 中国語（簡体字） | `zh-CN` | `zh-Hans` | `store-assets/google-play/localized/zh-CN/feature-graphic-1024x500.png` | `https://garana-pop.github.io/couple-swipe-app/en/privacy.html` |
| 中国語（繁体字） | `zh-TW` | `zh-Hant` | `store-assets/google-play/localized/zh-TW/feature-graphic-1024x500.png` | `https://garana-pop.github.io/couple-swipe-app/en/privacy.html` |

### グラフィック・スクリーンショットの一括再生成コマンド
```powershell
# 全7言語のフィーチャーグラフィック（1024x500 PNG）を一括生成
powershell -ExecutionPolicy Bypass -File scripts/build-store-i18n-assets.ps1

# 実機で撮影した多言語スクショを raw/<言語コード>/ に配置したあと、提出用1080x1920 PNGを一括生成
# 例: store-assets/google-play/screenshots/raw/en-US/01-home.jpg 〜 06-ai-report.jpg
powershell -ExecutionPolicy Bypass -File scripts/build-store-i18n-assets.ps1 -Screenshots
```

---

## 日本語（デフォルト） — Google Play: `ja-JP` / App Store: `ja`

- **フィーチャーグラフィック**: `store-assets/google-play/feature-graphic-1024x500.png`
- **法務ページ**: `https://garana-pop.github.io/couple-swipe-app/privacy.html` / `https://garana-pop.github.io/couple-swipe-app/terms.html` / `https://garana-pop.github.io/couple-swipe-app/account-deletion.html`

### アプリ名（14 / 30文字）
```text
Kotaeai（コタエアイ）
```

### Google Play 簡単な説明（69 / 80文字）
```text
1日3問、答え合わせで深まるふたりの距離。回答カレンダーで記録を残し、プレミアムなら過去の未回答日への遡り回答やAI相性診断も楽しめます。
```

### 詳しい説明（1134 / 4,000文字）
```text
「相手の気持ち、意外と知らないかも？」
Kotaeai（コタエアイ）は、カップルや夫婦が1日3問・4方向スワイプで価値観を答え合う、二人だけの毎日診断アプリです。

■ 特徴 1：1日3問、30秒で直感4択スワイプ
「休日の過ごし方」「お金や家事の感覚」「連絡ペース」「将来のこと」など、普段は改まって聞きづらいテーマを毎日3問お届け。上下左右にスワイプするだけで気軽に本音を答えられます。

■ 特徴 2：お互いが答え終わるまで秘密（後出し防止ロック）
片方が回答しただけでは、相手の答えは見られません。二人とも回答を終えた瞬間にロックが解除され、一致率とそれぞれの回答がひらきます。会話のきっかけ一言付きで、その日の話題にもぴったりです。

■ 特徴 3：回答カレンダー＆変化が見える振り返りタイムライン
・回答済み・未回答の日がひと目でわかる「回答カレンダー」と、連続ストリーク・自身の未回答日数・カテゴリ別一致率グラフで二人の歩みを可視化
・一定期間後に同じ質問が再出題されると、過去の自分たちとの回答変化を比較可能
・プライバシーに配慮した一致率カードで結果をシェア可能

■ 特徴 4：安心の設計＆通知機能
・メールアドレス不要の匿名スタート（機種変更時の引き継ぎ用に Google アカウント連携にも対応）
・毎日のリマインダー通知＆パートナー回答完了プッシュ通知で続けやすい

■ ふたりプレミアムプラン（任意・定期購入）
ペアのどちらか1人が加入すれば、パートナーも追加料金なしで一緒に使えます。
・回答カレンダーの未回答日をタップして、答え忘れた過去のお題へいつでも遡って回答＆相手の結果を解放（回答完了まで相手の答えを伏せるネタバレ防止付き）
・回答履歴＋回答リズムを分析する「深層AI相性診断レポート」と過去レポートアーカイブ（性格傾向やすれ違い予防のアドバイスに加え、万が一別れてしまった際の原因のAI診断・振り返りにも対応）

【定期購入について】
・年額プラン：¥3,000 / 年（月額プラン比 50% OFF・月250円相当・2人共有）
・月額プラン：¥500 / 月（2人共有）
・お支払いは Google Play アカウントへ請求され、次回更新の24時間前までに Google Play の「定期購入」から解約しない限り自動更新されます。
・アプリ内または Web ページからいつでもアカウントとデータを削除できます（アカウント削除だけでは定期購入は自動解約されないため、Google Play 側での解約手続きをお願いします）。

※AI相性診断レポートはコミュニケーション支援・エンターテインメントを目的とした参考情報です。
```

### リリースノート / What's new（141 / 500文字）
```text
・日本語に加え、英語・フランス語・韓国語・ロシア語・タイ語・中国語（簡体字／繁体字）の計8言語に対応しました。
・端末の言語設定（またはOSのアプリ別言語設定）に応じて表示・120問のお題・通知・AIレポートが自動で切り替わります。
・海外タイムゾーンでの日付同期にも対応しました。
```

### Google Play 定期購入の翻訳（収益化 ＞ 商品 ＞ 定期購入）
| 商品 ID | 名前（≤55） | 説明（≤80） | 特典リスト（各≤40） |
|---|---|---|---|
| `couple_swipe_yearly` | ふたりプレミアム（年額） (12) | 1人の加入で2人とも利用可能。月額比50% OFFでお得に全機能を解放。 (36) | 1人の加入でパートナーも無料共有 (16)<br>過去の未回答日へいつでも遡って回答 (17)<br>深層AI相性診断＆振り返りレポート (17)<br>月額プラン比50% OFFのお得な年額 (19) |
| `couple_swipe_monthly` | ふたりプレミアム（月額） (12) | 1人の加入で2人とも利用可能。過去日の遡り回答とAI相性診断を解放。 (34) | 1人の加入でパートナーも無料共有 (16)<br>過去の未回答日へいつでも遡って回答 (17)<br>深層AI相性診断＆振り返りレポート (17)<br>いつでもGoogle Playから解約可能 (21) |

### App Store Connect 向け（iOS 公開時）
- **サブタイトル（18 / 30文字）**: `1日3問、ふたりで答え合う価値観診断`
- **プロモーションテキスト（74 / 170文字）**: `1日3問、4方向スワイプで気軽に答え合わせ。お互いが答え終わるまで秘密だから本音がわかる。AI相性診断や回答カレンダーでふたりの距離がもっと深まる。`
- **キーワード（45 / 100文字）**: `カップル,夫婦,価値観,質問,診断,相性,クイズ,スワイプ,AI診断,恋愛,記念日,ふたり`

---

## 英語（アメリカ） — Google Play: `en-US` / App Store: `en-US`

- **フィーチャーグラフィック**: `store-assets/google-play/localized/en-US/feature-graphic-1024x500.png`
- **法務ページ**: `https://garana-pop.github.io/couple-swipe-app/en/privacy.html` / `https://garana-pop.github.io/couple-swipe-app/en/terms.html` / `https://garana-pop.github.io/couple-swipe-app/en/account-deletion.html`

### アプリ名（7 / 30文字）
```text
Kotaeai
```

### Google Play 簡単な説明（80 / 80文字）
```text
3 daily couple questions via 4-way swipe. Unlock answers together & AI insights.
```

### 詳しい説明（2344 / 4,000文字）
```text
How well do you really know your partner?
Kotaeai is a daily couples quiz app where you and your partner answer 3 thoughtful questions a day with an effortless 4-way swipe.

■ Feature 1: 3 Daily Questions in 30 Seconds
Explore topics that rarely come up in everyday small talk — weekends, chores, money, communication pace, affection, and future plans. Simply swipe up, down, left, or right to share your honest take.

■ Feature 2: Answers Stay Locked Until You Both Finish
Neither of you can peek before answering. The moment both partners complete the 3 questions, your match rate and side-by-side answers unlock with a conversation starter tailored to the topic.

■ Feature 3: Answer Calendar & Relationship Timeline
• Track streaks, missed days, and category match rates on a clean Answer Calendar.
• When a question repeats after time passes, compare how your views have evolved together.
• Share your match rate with privacy-friendly share cards.

■ Feature 4: Private by Design & Gentle Reminders
• Start instantly without an email address (optional Google sign-in for device transfer backup).
• Daily reminders and instant partner-finished push notifications keep the habit effortless.

■ Duo Premium (Optional Auto-Renewing Subscription)
Only one partner needs to subscribe — your partner unlocks all Premium features at no extra cost.
• Catch Up on Missed Days: Tap any past date on the calendar to answer missed questions and unlock results (answers stay spoiler-protected until you finish).
• Deep AI Compatibility Report & Archive: Analyzes your real answer history and rhythms to highlight personality types, potential friction points, and gentle tips — plus a supportive Relationship Reflection mode if you ever need closure.

[Subscription Information]
• Available as an Annual Plan (best value — 50% off vs. monthly) or Monthly Plan, shared by both partners.
• Pricing is shown in your local currency in the store before purchase.
• Payment is charged to your store account and renews automatically unless canceled at least 24 hours before the renewal date in your store subscription settings.
• You can delete your account and data anytime in-app or via our web page (note: deleting your account does not automatically cancel an active store subscription).

*AI reports are intended for conversation support and entertainment.
```

### リリースノート / What's new（333 / 500文字）
```text
• Added full 8-language support: English, Japanese, French, Korean, Russian, Thai, Simplified Chinese, and Traditional Chinese.
• Automatically matches your device language (and supports OS per-app language settings) across UI, 120 questions, push notifications, and AI reports.
• Added global timezone support for daily quiz resets.
```

### Google Play 定期購入の翻訳（収益化 ＞ 商品 ＞ 定期購入）
| 商品 ID | 名前（≤55） | 説明（≤80） | 特典リスト（各≤40） |
|---|---|---|---|
| `couple_swipe_yearly` | Duo Premium (Annual) (20) | 1 plan covers both partners. Save 50% vs. monthly and unlock all features. (74) | 1 plan covers both partners (27)<br>Answer missed past days anytime (31)<br>Deep AI compatibility & reflection (34)<br>Save 50% vs. monthly billing (28) |
| `couple_swipe_monthly` | Duo Premium (Monthly) (21) | 1 subscription covers both partners. Unlock past catch-up days & AI reports. (76) | 1 plan covers both partners (27)<br>Answer missed past days anytime (31)<br>Deep AI compatibility & reflection (34)<br>Cancel anytime in store settings (32) |

### App Store Connect 向け（iOS 公開時）
- **サブタイトル（29 / 30文字）**: `Daily 3-Question Couples Quiz`
- **プロモーションテキスト（153 / 170文字）**: `Swipe 3 daily questions with your partner in 30 seconds. Answers stay secret until you both finish — spark deeper talks with match stats and AI insights.`
- **キーワード（95 / 100文字）**: `couples,quiz,relationship,partner,questions,daily,love,compatibility,marriage,date,swipe,values`

---

## フランス語（フランス） — Google Play: `fr-FR` / App Store: `fr-FR`

- **フィーチャーグラフィック**: `store-assets/google-play/localized/fr-FR/feature-graphic-1024x500.png`
- **法務ページ**: `https://garana-pop.github.io/couple-swipe-app/en/privacy.html` / `https://garana-pop.github.io/couple-swipe-app/en/terms.html` / `https://garana-pop.github.io/couple-swipe-app/en/account-deletion.html`

### アプリ名（7 / 30文字）
```text
Kotaeai
```

### Google Play 簡単な説明（74 / 80文字）
```text
3 questions couple/jour par swipe. Réponses débloquées à deux et bilan IA.
```

### 詳しい説明（2332 / 4,000文字）
```text
Connaissez-vous vraiment les pensées de votre partenaire ?
Kotaeai est l'application de quiz quotidien pour couples : 3 questions par jour à répondre en 30 secondes d'un simple swipe dans 4 directions.

■ 1. Trois questions par jour, 4 choix par swipe
Week-end idéal, partage des tâches, budget, rythme des messages, projets d'avenir… Explorez facilement des sujets essentiels en glissant simplement vers le haut, le bas, la gauche ou la droite.

■ 2. Réponses secrètes jusqu'à ce que vous ayez fini tous les deux
Impossible de tricher avant de répondre : les résultats et votre taux de compatibilité se débloquent au moment où vous avez terminé tous les deux, accompagnés d'une amorce de discussion.

■ 3. Calendrier de réponses & suivi de votre duo
• Suivez votre série de jours, vos jours manqués et votre compatibilité par catégorie sur le calendrier.
• Lorsqu'une question revient plus tard, comparez l'évolution de vos réponses.
• Partagez votre taux de compatibilité grâce à des cartes respectueuses de votre vie privée.

■ 4. Simple, privé et sans inscription obligatoire
• Démarrez anonymement sans adresse e-mail (connexion Google en option pour sauvegarder lors d'un changement de téléphone).
• Rappels quotidiens et notification dès que votre partenaire a terminé.

■ Duo Premium (abonnement optionnel)
Un seul abonnement suffit : votre partenaire profite de toutes les fonctions Premium sans frais supplémentaires.
• Rattrapage des jours passés : répondez aux questions manquées depuis le calendrier tout en gardant la réponse de l'autre cachée jusqu'à la fin.
• Bilan IA de compatibilité approfondi & archives : analyse vos vraies réponses et votre rythme pour éclairer vos profils, prévenir les malentendus et même offrir un bilan bienveillant en cas de remise en question.

[À propos de l'abonnement]
• Formule Annuelle (-50 % par rapport au mensuel) ou Mensuelle, partagée pour le couple.
• Le tarif dans votre devise s'affiche dans la boutique avant confirmation.
• Renouvellement automatique sauf annulation au moins 24 h avant l'échéance dans les paramètres de votre boutique.
• Suppression du compte et des données possible à tout moment dans l'app ou sur le Web (la suppression du compte ne résilie pas automatiquement l'abonnement).

*Les rapports IA sont destinés à enrichir le dialogue et au divertissement.
```

### リリースノート / What's new（342 / 500文字）
```text
• Prise en charge complète de 8 langues : français, anglais, japonais, coréen, russe, thaï, chinois simplifié et traditionnel.
• Adaptation automatique à la langue du téléphone (et aux réglages de langue par application) pour l'interface, les 120 questions, les notifications et les bilans IA.
• Gestion automatique du fuseau horaire mondial.
```

### Google Play 定期購入の翻訳（収益化 ＞ 商品 ＞ 定期購入）
| 商品 ID | 名前（≤55） | 説明（≤80） | 特典リスト（各≤40） |
|---|---|---|---|
| `couple_swipe_yearly` | Duo Premium (Annuel) (20) | 1 abonnement pour le couple. -50 % vs mensuel pour tout débloquer à deux. (73) | 1 abonnement partagé pour deux (30)<br>Rattrapez les jours passés au choix (35)<br>Bilan IA complet et archives (28)<br>-50 % par rapport au forfait mensuel (36) |
| `couple_swipe_monthly` | Duo Premium (Mensuel) (21) | 1 abonnement pour le couple. Jours passés à rattraper et bilans IA inclus. (74) | 1 abonnement partagé pour deux (30)<br>Rattrapez les jours passés au choix (35)<br>Bilan IA complet et archives (28)<br>Résiliable à tout moment sur le store (37) |

### App Store Connect 向け（iOS 公開時）
- **サブタイトル（30 / 30文字）**: `Quiz couple : 3 questions/jour`
- **プロモーションテキスト（163 / 170文字）**: `3 questions par jour à swiper en couple. Les réponses restent secrètes jusqu'à ce que vous ayez répondu tous les deux. Calendrier, statistiques et bilan IA inclus.`
- **キーワード（92 / 100文字）**: `couple,quiz,relation,partenaire,questions,amour,compatibilité,valeurs,dialogue,swipe,jeu,duo`

---

## 韓国語 — Google Play: `ko-KR` / App Store: `ko`

- **フィーチャーグラフィック**: `store-assets/google-play/localized/ko-KR/feature-graphic-1024x500.png`
- **法務ページ**: `https://garana-pop.github.io/couple-swipe-app/en/privacy.html` / `https://garana-pop.github.io/couple-swipe-app/en/terms.html` / `https://garana-pop.github.io/couple-swipe-app/en/account-deletion.html`

### アプリ名（7 / 30文字）
```text
Kotaeai
```

### Google Play 簡単な説明（52 / 80文字）
```text
하루 3문항 4방향 스와이프 커플 질문. 둘 다 답해야 공개되는 결과와 AI 궁합 리포트까지!
```

### 詳しい説明（1166 / 4,000文字）
```text
“연인의 속마음, 의외로 잘 모를지도 몰라요.”
Kotaeai는 연인·부부가 하루 3문항을 4방향 스와이프로 답하며 서로의 가치관을 알아가는 커플 전용 데일리 퀴즈 앱입니다.

■ 특징 1: 하루 3문항, 30초 직관 4방향 스와이프
주말 보내는 법, 집안일과 소비 기준, 연락 빈도, 미래 계획까지 — 평소 꺼내기 어려웠던 주제를 매일 3개씩 만나보세요. 상하좌우 스와이프만으로 부담 없이 솔직한 마음을 고를 수 있어요.

■ 특징 2: 둘 다 답하기 전까지 비밀 (스포일러 방지 잠금)
한 명만 답했을 때는 상대의 답이 보이지 않습니다. 두 사람 모두 답변을 마치는 순간 잠금이 풀리며 일치율과 서로의 선택이 나란히 열립니다. 대화 주제 추천과 함께 자연스럽게 이야기를 이어가 보세요.

■ 특징 3: 답변 캘린더 & 변화가 보이는 기록
• 답변 완료/미답변 날짜가 한눈에 들어오는 캘린더와 연속 기록, 카테고리별 일치율 그래프 제공
• 시간이 지나 같은 질문이 다시 나오면 과거의 우리와 지금의 답변 변화를 비교할 수 있어요
• 프라이버시를 지키는 일치율 카드로 결과를 간편하게 공유하세요

■ 특징 4: 안심 설계 & 맞춤 알림
• 이메일 없이 익명으로 바로 시작 (기기 변경 백업용 Google 계정 연동 지원)
• 매일 리마인더 알림과 파트너 답변 완료 푸시 알림으로 꾸준히 이어갈 수 있어요

■ 둘이서 프리미엄 (선택 구독)
커플 중 한 명만 구독하면 파트너도 추가 비용 없이 모든 프리미엄 기능을 함께 이용합니다.
• 지난 미답변 날짜 따라잡기: 캘린더에서 놓친 날을 눌러 언제든 답변하고 결과를 열어보세요 (완료 전까지 상대 답변 비공개).
• 심층 AI 궁합 리포트 & 아카이브: 실제 답변 기록과 리듬을 분석해 성격 유형, 엇갈림 예방 팁은 물론 관계 회고 리포트까지 따뜻하게 정리해 드립니다.

[정기 결제 안내]
• 연간 플랜(월간 대비 50% 할인) 및 월간 플랜 제공, 1인 결제로 2인 공유.
• 결제 금액은 구매 전 스토어 화면에 현지 통화로 표시됩니다.
• 갱신 24시간 전까지 스토어 구독 설정에서 해지하지 않으면 자동 갱신됩니다.
• 앱 또는 웹에서 언제든 계정과 데이터를 삭제할 수 있습니다 (계정 삭제만으로 구독은 자동 해지되지 않으므로 스토어에서 해지해 주세요).

※ AI 리포트는 커플 소통 지원 및 엔터테인먼트 목적의 참고 정보입니다.
```

### リリースノート / What's new（155 / 500文字）
```text
• 한국어를 포함해 일본어·영어·프랑스어·러시아어·태국어·중국어(간체/번체) 총 8개 언어를 지원합니다.
• 기기 언어 또는 OS의 앱별 언어 설정에 따라 화면, 120개 질문, 푸시 알림, AI 리포트가 자동으로 전환됩니다.
• 글로벌 시간대별 일일 질문 동기화를 지원합니다.
```

### Google Play 定期購入の翻訳（収益化 ＞ 商品 ＞ 定期購入）
| 商品 ID | 名前（≤55） | 説明（≤80） | 特典リスト（各≤40） |
|---|---|---|---|
| `couple_swipe_yearly` | 둘이서 프리미엄 (연간) (13) | 1인 구독으로 2인 공유. 월간 대비 50% 할인으로 모든 기능을 함께 이용하세요. (46) | 1명만 구독해도 파트너 무료 공유 (18)<br>놓친 지난 날짜 언제든 다시 답변 (18)<br>심층 AI 궁합 리포트 & 아카이브 (19)<br>월간 플랜 대비 50% 할인 혜택 (18) |
| `couple_swipe_monthly` | 둘이서 프리미엄 (월간) (13) | 1인 구독으로 2인 공유. 지난 질문 따라잡기와 심층 AI 궁합 리포트를 열어보세요. (47) | 1명만 구독해도 파트너 무료 공유 (18)<br>놓친 지난 날짜 언제든 다시 답변 (18)<br>심층 AI 궁합 리포트 & 아카이브 (19)<br>스토어 설정에서 언제든 해지 가능 (18) |

### App Store Connect 向け（iOS 公開時）
- **サブタイトル（18 / 30文字）**: `하루 3문항 커플 가치관 스와이프`
- **プロモーションテキスト（85 / 170文字）**: `하루 3문항, 4방향 스와이프로 30초 만에 알아가는 연인의 속마음. 둘 다 답해야 열리는 비밀 결과와 캘린더, AI 궁합 리포트로 대화가 더 깊어져요.`
- **キーワード（42 / 100文字）**: `커플,연인,부부,질문,가치관,궁합,퀴즈,스와이프,AI궁합,연애,기념일,커플앱`

---

## ロシア語 — Google Play: `ru-RU` / App Store: `ru`

- **フィーチャーグラフィック**: `store-assets/google-play/localized/ru-RU/feature-graphic-1024x500.png`
- **法務ページ**: `https://garana-pop.github.io/couple-swipe-app/en/privacy.html` / `https://garana-pop.github.io/couple-swipe-app/en/terms.html` / `https://garana-pop.github.io/couple-swipe-app/en/account-deletion.html`

### アプリ名（7 / 30文字）
```text
Kotaeai
```

### Google Play 簡単な説明（77 / 80文字）
```text
3 вопроса в день для пар свайпом в 4 стороны. Ответы открываются вдвоём + ИИ.
```

### 詳しい説明（1857 / 4,000文字）
```text
Насколько хорошо вы знаете мысли своего партнёра?
Kotaeai — ежедневный квиз для пар: 3 вопроса в день и удобный выбор ответа свайпом в 4 стороны всего за 30 секунд.

■ 1. Три вопроса в день за 30 секунд
Выходные, быт, финансы, ритм общения, забота и планы на будущее — обсуждайте важные темы легко, просто свайпая карточку вверх, вниз, влево или вправо.

■ 2. Ответы скрыты, пока не ответят оба
Подсмотреть заранее нельзя: процент совпадения и ответы друг друга открываются одновременно, как только оба партнёра завершат 3 вопроса, вместе с поводом для разговора.

■ 3. Календарь ответов и история изменений
• Наглядный календарь, серия дней, пропущенные даты и совпадение по категориям.
• Когда вопрос повторяется спустя время, можно сравнить, как изменились ваши взгляды.
• Делитесь процентом совпадения с помощью приватной карточки.

■ 4. Приватность и удобные напоминания
• Быстрый анонимный старт без почты (привязка Google по желанию для переноса на новое устройство).
• Ежедневные напоминания и пуш-уведомление, когда партнёр уже ответил.

■ Duo Premium (подписка по желанию)
Достаточно одной подписки на пару — второй партнёр получает полный доступ бесплатно.
• Пропущенные дни: отвечайте на прошлые вопросы из календаря в любое время (ответ партнёра скрыт до завершения).
• Глубокий ИИ-отчёт совместимости и архив: анализ реальных ответов и ритма пары, советы по гармонии и бережный режим рефлексии отношений.

[О подписке]
• Годовой (выгода 50% против месячного) или месячный план для обоих партнёров.
• Цена в вашей валюте показывается в магазине перед оплатой.
• Автопродление можно отключить не позднее чем за 24 часа до конца периода в настройках подписок магазина.
• Аккаунт и данные можно удалить в приложении или на сайте (удаление аккаунта не отменяет подписку автоматически).

*ИИ-отчёты носят развлекательный и рекомендательный характер.
```

### リリースノート / What's new（331 / 500文字）
```text
• Добавлена полная поддержка 8 языков: русский, английский, японский, французский, корейский, тайский, упрощённый и традиционный китайский.
• Язык интерфейса, 120 вопросов, уведомлений и ИИ-отчётов автоматически следует за языком устройства (и настройками языка приложения в ОС).
• Добавлена поддержка часовых поясов по всему миру.
```

### Google Play 定期購入の翻訳（収益化 ＞ 商品 ＞ 定期購入）
| 商品 ID | 名前（≤55） | 説明（≤80） | 特典リスト（各≤40） |
|---|---|---|---|
| `couple_swipe_yearly` | Duo Premium (Годовой) (21) | 1 подписка на двоих. Скидка 50% к месячной цене и доступ ко всем функциям. (74) | 1 подписка работает для обоих (29)<br>Ответы на пропущенные дни (25)<br>Глубокий ИИ-отчёт и архив (25)<br>Выгода 50% при оплате за год (28) |
| `couple_swipe_monthly` | Duo Premium (Месячный) (22) | 1 подписка на двоих. Пропущенные дни в календаре и ИИ-отчёты совместимости. (75) | 1 подписка работает для обоих (29)<br>Ответы на пропущенные дни (25)<br>Глубокий ИИ-отчёт и архив (25)<br>Отмена в любой момент в магазине (32) |

### App Store Connect 向け（iOS 公開時）
- **サブタイトル（25 / 30文字）**: `3 вопроса в день для пары`
- **プロモーションテキスト（140 / 170文字）**: `3 вопроса в день свайпом в 4 стороны для пары. Ответы открываются только когда ответят оба — календарь, статистика и ИИ-отчёт совместимости.`
- **キーワード（86 / 100文字）**: `пара,отношения,викторина,вопросы,совместимость,любовь,партнер,семья,свайп,игра,тест,ии`

---

## タイ語 — Google Play: `th` / App Store: `th`

- **フィーチャーグラフィック**: `store-assets/google-play/localized/th/feature-graphic-1024x500.png`
- **法務ページ**: `https://garana-pop.github.io/couple-swipe-app/en/privacy.html` / `https://garana-pop.github.io/couple-swipe-app/en/terms.html` / `https://garana-pop.github.io/couple-swipe-app/en/account-deletion.html`

### アプリ名（7 / 30文字）
```text
Kotaeai
```

### Google Play 簡単な説明（76 / 80文字）
```text
คำถามคู่รักวันละ 3 ข้อ ปัด 4 ทิศทาง ปลดล็อกเมื่อตอบครบทั้งคู่ พร้อมรายงาน AI
```

### 詳しい説明（1917 / 4,000文字）
```text
คุณรู้จักใจอีกฝ่ายดีแค่ไหน?
Kotaeai คือแอปคำถามคู่รักรายวัน วันละ 3 ข้อ ให้คุณกับคนรักตอบใจตรงกันง่ายๆ ด้วยการปัด 4 ทิศทางภายใน 30 วินาที

■ จุดเด่นที่ 1: วันละ 3 ข้อ ปัด 4 ทิศทางใน 30 วินาที
ครอบคลุมเรื่องวันหยุด งานบ้าน การเงิน จังหวะการคุย และอนาคต — หัวข้อที่ปกติไม่ค่อยได้ถามกันตรงๆ แค่ปัดขึ้น ลง ซ้าย หรือขวาเพื่อเลือกคำตอบที่ใช่

■ จุดเด่นที่ 2: เก็บเป็นความลับจนกว่าจะตอบครบทั้งคู่
ไม่มีแอบดูคำตอบก่อน เมื่อทั้งสองฝ่ายตอบครบทั้ง 3 ข้อ ระบบจะปลดล็อกเปอร์เซ็นต์ความเข้ากันได้และคำตอบของทั้งคู่ทันที พร้อมหัวข้อชวนคุยประจำวัน

■ จุดเด่นที่ 3: ปฏิทินคำตอบและบันทึกความเปลี่ยนแปลง
• ดูวันที่ตอบแล้วและวันที่พลาดได้ในปฏิทิน พร้อมสถิติต่อเนื่องและความเข้ากันได้ตามหมวดหมู่
• เมื่อคำถามเดิมวนกลับมาอีกครั้ง เปรียบเทียบดูได้ว่ามุมมองของทั้งคู่เปลี่ยนไปอย่างไร
• แชร์การ์ดเปอร์เซ็นต์ความเข้ากันได้แบบรักษาความเป็นส่วนตัว

■ จุดเด่นที่ 4: เริ่มใช้ง่าย เป็นส่วนตัว พร้อมแจ้งเตือน
• เริ่มเล่นแบบไม่ระบุตัวตนได้ทันที ไม่ต้องใช้อีเมล (เชื่อมบัญชี Google เพิ่มได้เพื่อสำรองข้อมูลเวลาย้ายเครื่อง)
• แจ้งเตือนรายวันและแจ้งเตือนทันทีเมื่ออีกฝ่ายตอบเสร็จ

■ แพ็กเกจพรีเมียมคู่รัก (สมัครสมาชิกเพิ่มเติม)
สมัครเพียงคนเดียว อีกฝ่ายก็ใช้ฟีเจอร์พรีเมียมทั้งหมดได้ฟรีไม่มีค่าใช้จ่ายเพิ่ม
• ตอบย้อนหลังวันที่พลาด: แตะวันที่ยังไม่ได้ตอบบนปฏิทินเพื่อตอบและเปิดดูผลได้ทุกเมื่อ (ซ่อนคำตอบอีกฝ่ายจนกว่าคุณจะตอบครบ)
• รายงานวิเคราะห์ความเข้ากันได้ด้วย AI และคลังย้อนหลัง: วิเคราะห์จากคำตอบและจังหวะการตอบจริง ช่วยแนะนำแนวทางลดความไม่เข้าใจกัน พร้อมโหมดทบทวนความสัมพันธ์อย่างอ่อนโยน

[ข้อมูลการสมัครสมาชิก]
• มีให้เลือกทั้งรายปี (คุ้มกว่า 50% เมื่อเทียบกับรายเดือน) และรายเดือน ใช้ร่วมกันได้ทั้งคู่
• ราคาจะแสดงเป็นสกุลเงินท้องถิ่นบนสโตร์ก่อนยืนยันการชำระเงิน
• ต่ออายุอัตโนมัติเว้นแต่จะยกเลิกอย่างน้อย 24 ชั่วโมงก่อนครบรอบในการตั้งค่าการสมัครสมาชิกของสโตร์
• ลบบัญชีและข้อมูลได้ทุกเมื่อในแอปหรือหน้าเว็บ (การลบบัญชีไม่ได้ยกเลิกการสมัครสมาชิกอัตโนมัติ กรุณายกเลิกในสโตร์ด้วย)

*รายงาน AI จัดทำขึ้นเพื่อช่วยเสริมการสื่อสารและความบันเทิงเท่านั้น
```

### リリースノート / What's new（244 / 500文字）
```text
• รองรับครบ 8 ภาษา: ไทย อังกฤษ ญี่ปุ่น ฝรั่งเศส เกาหลี รัสเซีย จีนตัวย่อ และจีนตัวเต็ม
• เปลี่ยนภาษา UI คำถาม 120 ข้อ การแจ้งเตือน และรายงาน AI อัตโนมัติตามภาษาเครื่องหรือการตั้งค่าภาษาเฉพาะแอป
• รองรับเขตเวลาทั่วโลกสำหรับการรีเซ็ตคำถามประจำวัน
```

### Google Play 定期購入の翻訳（収益化 ＞ 商品 ＞ 定期購入）
| 商品 ID | 名前（≤55） | 説明（≤80） | 特典リスト（各≤40） |
|---|---|---|---|
| `couple_swipe_yearly` | พรีเมียมคู่รัก (รายปี) (22) | สมัครคนเดียวใช้ได้ทั้งคู่ ประหยัด 50% จากรายเดือน ปลดล็อกครบทุกฟีเจอร์ (70) | สมัคร 1 คน แชร์ฟรีให้คู่ของคุณ (30)<br>ตอบคำถามวันย้อนหลังที่พลาดได้ (29)<br>รายงานความเข้ากันได้ AI เชิงลึก (31)<br>ประหยัด 50% เมื่อเทียบกับรายเดือน (33) |
| `couple_swipe_monthly` | พรีเมียมคู่รัก (รายเดือน) (25) | สมัครคนเดียวใช้ได้ทั้งคู่ ปลดล็อกตอบย้อนหลังและรายงานวิเคราะห์ AI (65) | สมัคร 1 คน แชร์ฟรีให้คู่ของคุณ (30)<br>ตอบคำถามวันย้อนหลังที่พลาดได้ (29)<br>รายงานความเข้ากันได้ AI เชิงลึก (31)<br>ยกเลิกได้ทุกเมื่อในตั้งค่าสโตร์ (31) |

### App Store Connect 向け（iOS 公開時）
- **サブタイトル（22 / 30文字）**: `คำถามคู่รักวันละ 3 ข้อ`
- **プロモーションテキスト（123 / 170文字）**: `วันละ 3 ข้อ ปัด 4 ทิศทางใน 30 วินาที คำตอบจะปลดล็อกเมื่อตอบครบทั้งคู่ พร้อมปฏิทินคำตอบ สถิติ และรายงานความเข้ากันได้ด้วย AI`
- **キーワード（90 / 100文字）**: `คู่รัก,แฟน,คำถาม,ความรัก,ควิซ,ความเข้ากันได้,ปัด,ความสัมพันธ์,คุยกับแฟน,ชีวิตคู่,AI,ทุกวัน`

---

## 中国語（簡体字） — Google Play: `zh-CN` / App Store: `zh-Hans`

- **フィーチャーグラフィック**: `store-assets/google-play/localized/zh-CN/feature-graphic-1024x500.png`
- **法務ページ**: `https://garana-pop.github.io/couple-swipe-app/en/privacy.html` / `https://garana-pop.github.io/couple-swipe-app/en/terms.html` / `https://garana-pop.github.io/couple-swipe-app/en/account-deletion.html`

### アプリ名（7 / 30文字）
```text
Kotaeai
```

### Google Play 簡単な説明（39 / 80文字）
```text
每天3题四向滑动情侣问答。双方答完同步解锁答案，还有答题日历与AI契合度报告。
```

### 詳しい説明（772 / 4,000文字）
```text
“TA的真实想法，其实你了解多少？”
Kotaeai 是一款专为情侣与伴侣打造的每日问答应用，每天 3 道题、四方向轻松滑动，30 秒读懂彼此的价值观与默契。

■ 亮点 1：每天 3 题，30 秒直觉四向滑动
涵盖周末安排、家务消费、联系节奏、亲密表达与未来规划等平时不好开口的话题。只需上下左右轻轻一滑，就能自然表达真实想法。

■ 亮点 2：双方答完前严格保密（防剧透锁定）
只有一方作答时无法偷看对方答案。两人全部完成的那一刻同步解锁契合度与双人答案对比，并附带贴心聊天话题，轻松开启今日对话。

■ 亮点 3：答题日历与成长记录
• 清晰呈现已答与未答日期的「答题日历」，搭配连续打卡、未答天数与分类契合度图表。
• 隔段时间再次遇到同一道题时，可对比过去与现在的想法变化。
• 支持保护隐私的契合度分享卡片。

■ 亮点 4：安心隐私与贴心提醒
• 无需邮箱即可匿名开始（可选绑定 Google 账号，方便换机同步数据）。
• 每日定时提醒与伴侣答完推送通知，让坚持变得轻松自然。

■ 双人高级版（可选订阅）
只需一人开通，伴侣无需额外付费即可共享全部高级权益。
• 往日补答解锁：在日历中点击漏答的日期随时补答并解锁结果（你答完前对方答案依然保密）。
• 深度 AI 契合度报告与历史档案：结合真实答题记录与作答节奏分析性格倾向与磨合建议，同时支持温柔的关系复盘反思模式。

【订阅说明】
• 提供年付方案（相比月付立省 50%）与月付方案，一人开通两人共享。
• 实际价格将在付款前按商店当地货币显示。
• 订阅将自动续费，如需取消请在续费前至少 24 小时前往应用商店订阅管理中操作。
• 可随时在应用内或网页端删除账号与数据（删除账号不会自动取消商店订阅，请另行在商店取消）。

※ AI 分析报告仅供沟通参考与日常娱乐。
```

### リリースノート / What's new（102 / 500文字）
```text
• 全新支持 8 种语言：简体中文、繁体中文、英语、日语、法语、韩语、俄语、泰语。
• 自动跟随系统语言或系统“应用语言”设置切换界面、120 道题库、推送通知与 AI 报告。
• 新增全球时区同步支持。
```

### Google Play 定期購入の翻訳（収益化 ＞ 商品 ＞ 定期購入）
| 商品 ID | 名前（≤55） | 説明（≤80） | 特典リスト（各≤40） |
|---|---|---|---|
| `couple_swipe_yearly` | 双人高级版（年付） (9) | 一人开通两人共享，比月付省50%，解锁补答与深度AI契合度报告。 (32) | 一人开通，伴侣免费共享 (11)<br>日历随时补答漏答的往日题目 (13)<br>深度AI契合度分析与历史档案 (14)<br>比月付方案立省50%更划算 (13) |
| `couple_swipe_monthly` | 双人高级版（月付） (9) | 一人开通两人共享，解锁往日补答与深度AI契合度分析报告。 (28) | 一人开通，伴侣免费共享 (11)<br>日历随时补答漏答的往日题目 (13)<br>深度AI契合度分析与历史档案 (14)<br>随时可在应用商店取消订阅 (12) |

### App Store Connect 向け（iOS 公開時）
- **サブタイトル（14 / 30文字）**: `每日3题情侣四向滑动默契问答`
- **プロモーションテキスト（58 / 170文字）**: `每天30秒，四方向滑动回答3道情侣价值观问题。双方答完才解锁真实答案，搭配答题日历与AI契合度报告，让彼此更懂对方。`
- **キーワード（39 / 100文字）**: `情侣,伴侣,夫妻,默契,问答,测试,价值观,契合度,恋爱,滑动,AI分析,感情`

---

## 中国語（繁体字） — Google Play: `zh-TW` / App Store: `zh-Hant`

- **フィーチャーグラフィック**: `store-assets/google-play/localized/zh-TW/feature-graphic-1024x500.png`
- **法務ページ**: `https://garana-pop.github.io/couple-swipe-app/en/privacy.html` / `https://garana-pop.github.io/couple-swipe-app/en/terms.html` / `https://garana-pop.github.io/couple-swipe-app/en/account-deletion.html`

### アプリ名（7 / 30文字）
```text
Kotaeai
```

### Google Play 簡単な説明（38 / 80文字）
```text
每天3題四向滑動情侶問答。雙方答完同步解鎖答案，還有答題日曆與AI契合報告。
```

### 詳しい説明（781 / 4,000文字）
```text
「對方的真實想法，其實你了解多少？」
Kotaeai 是專為情侶與伴侶打造的每日問答 App，每天 3 道題、四方向直覺滑動，30 秒輕鬆了解彼此的價值觀與默契。

■ 特色 1：每天 3 題，30 秒直覺四向滑動
涵蓋假日安排、家事與消費觀、聯絡節奏、相處方式與未來規劃等平時較少聊到的主題，只要上下左右滑動就能輕鬆表達真心話。

■ 特色 2：雙方完成前全程保密（防雷鎖定）
只有一方作答時無法偷看對方答案；當兩人都完成 3 道題的瞬間，系統會同步解鎖契合度與雙人答案對比，並附上貼心聊天引子，讓每天都有好話題。

■ 特色 3：答題日曆與成長回顧
• 一眼掌握已答與未答日期的「答題日曆」，搭配連續天數、未答天數與分類默契率圖表。
• 隔段時間再次遇到相同題目時，可對照過去與現在的想法變化。
• 提供重視隱私的契合度分享卡片。

■ 特色 4：安心隱私與貼心通知
• 免註冊信箱即可匿名開始（可選綁定 Google 帳號，換機時輕鬆移轉資料）。
• 每日定時提醒與伴侶作答完成推播通知，讓兩人輕鬆養成習慣。

■ 雙人進階方案（可選訂閱）
只要其中一人訂閱，伴侶免額外付費即可共享所有進階功能。
• 過往漏答補答：點擊日曆上的未答日期，隨時補答並解鎖結果（完成前對方答案仍保持隱藏）。
• 深度 AI 契合分析報告與歷史檔案：依據真實作答紀錄與節奏整理性格傾向與相處建議，也提供溫柔的關係回顧反思模式。

【訂閱說明】
• 提供年訂方案（較月訂省 50%）與月訂方案，一人訂閱兩人共享。
• 實際費用將於付款前以商店當地幣別顯示。
• 訂閱將自動續訂，若欲取消請於續訂日前至少 24 小時至商店訂閱設定操作。
• 可隨時於 App 內或網頁刪除帳號與資料（刪除帳號不會自動取消商店訂閱，請另至商店取消）。

※ AI 分析報告僅供溝通參考與日常娛樂之用。
```

### リリースノート / What's new（107 / 500文字）
```text
• 全新支援 8 種語言：繁體中文、簡體中文、英文、日文、法文、韓文、俄文、泰文。
• 依裝置語言或系統「應用程式語言」設定自動切換介面、120 道題庫、推播通知與 AI 報告。
• 新增全球時區每日題目同步支援。
```

### Google Play 定期購入の翻訳（収益化 ＞ 商品 ＞ 定期購入）
| 商品 ID | 名前（≤55） | 説明（≤80） | 特典リスト（各≤40） |
|---|---|---|---|
| `couple_swipe_yearly` | 雙人進階方案（年訂） (10) | 一人訂閱兩人共享，較月訂省50%，解鎖補答與深度AI契合報告。 (31) | 一人訂閱，伴侶免費共享 (11)<br>日曆隨時補答漏答的過往題目 (13)<br>深度AI契合分析與歷史檔案 (13)<br>較月訂方案立省50%更划算 (13) |
| `couple_swipe_monthly` | 雙人進階方案（月訂） (10) | 一人訂閱兩人共享，解鎖過往補答與深度AI契合分析報告。 (27) | 一人訂閱，伴侶免費共享 (11)<br>日曆隨時補答漏答的過往題目 (13)<br>深度AI契合分析與歷史檔案 (13)<br>隨時可於商店設定取消訂閱 (12) |

### App Store Connect 向け（iOS 公開時）
- **サブタイトル（14 / 30文字）**: `每日3題情侶四向滑動默契問答`
- **プロモーションテキスト（59 / 170文字）**: `每天30秒，四方向滑動回答3道情侶價值觀題目。雙方完成才同步解鎖真實答案，搭配答題日曆與AI契合報告，讓兩人更懂彼此。`
- **キーワード（39 / 100文字）**: `情侶,伴侶,夫妻,默契,問答,測驗,價值觀,契合度,戀愛,滑動,AI分析,感情`

---

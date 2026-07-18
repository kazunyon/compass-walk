# コンパスウォーク運動・生活記録

片麻痺があり電動車椅子を利用する本人のための、リハビリデイサービスと日々の生活を記録する PWA（インストール可能な Web アプリ）です。左手だけの操作や失語症を考慮し、大きな選択ボタンと短く分かりやすい表示を中心にしています。

## 主な機能

- ホーム、予定カレンダー、記録入力、記録詳細、振り返り、データ管理の6画面
- 月・木の通常利用を月単位で一括登録し、日ごとに通常利用・振替利用・休み・中止へ変更
- 日付ごとの天気の登録
- 体調、睡眠、疲労、気分、痛み、バイタル、運動、補助具、担当者、成果などの記録
- 入力中の内容を端末内へ自動保存（30秒ごとにも保存）
- 記録の詳細表示と、期間別の体調・痛み・満足度の推移グラフ
- 利用回数・休み回数・振替回数、運動種別の実施回数、よく記録された成果の集計
- 記録の印刷
- JSON 形式でのバックアップ・復元（復元前には現在のデータを自動バックアップ）
- 記録の CSV 出力
- PWA のインストール案内と更新通知

## データの保存場所

データはこのブラウザ・端末内の IndexedDB に保存されます。別の端末やブラウザには自動同期されません。大切な記録は、定期的に「データ管理」画面から JSON バックアップを保存してください。

| テーブル | 保存内容 |
| --- | --- |
| `staff` | 担当者の氏名・職種・登録日時 |
| `schedules` | 利用日、利用種別、メモ、更新日時 |
| `records` | 体調、天気、バイタル、運動、担当者、生活・支援の記録 |
| `drafts` | 記録入力中の下書き |

初回起動時には、杉本・松本（理学療法士）、八木澤（柔道整復師）、田村（看護師）を担当者として登録します。

## 使い方

1. 「予定」で利用予定と天気を登録します。
2. 「記録」でその日の体調や運動内容を入力し、保存します。途中の入力は自動保存されます。
3. 「振り返り」で今月、3か月、6か月、1年の変化を確認します。
4. 「データ管理」から、必要に応じて JSON バックアップまたは CSV 出力を行います。

## 開発環境での起動

Node.js を用意したうえで、以下を実行します。

```bash
npm install
npm run dev
```

開発サーバーの URL は、起動時に Vite が表示します。

## 利用可能なコマンド

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバーを起動 |
| `npm run build` | TypeScript の型検査と本番用ビルドを実行 |
| `npm run lint` | 静的解析を実行 |
| `npm run preview` | 本番ビルドをローカルで確認 |

## 技術構成

- React / TypeScript / Vite
- React Router
- Dexie（IndexedDB）
- React Hook Form
- Recharts
- vite-plugin-pwa

## PWA について

対応ブラウザでは、表示される「アプリを追加」から端末へインストールできます。オフラインでも確認・記録できるよう、アプリの静的ファイルをキャッシュします。新しい版が利用可能になると、画面上に更新の案内が表示されます。

## GitHub Pages への公開

このリポジトリは GitHub Pages のプロジェクトサイトとして公開します。公開URLは次のとおりです。

- トップ: `https://kazunyon.github.io/compass-walk/`
- 予定: `https://kazunyon.github.io/compass-walk/calendar`
- 記録: `https://kazunyon.github.io/compass-walk/record`

GitHub の **Settings → Pages** で、公開元（Source）を **GitHub Actions** に設定してください。`main` ブランチへ push すると、`.github/workflows/deploy.yml` が `npm ci`、`npm run build`、Pages へのデプロイを自動実行します。

### 公開パスと画面遷移

GitHub Pages ではリポジトリ名を含む `/compass-walk/` が公開先になります。`vite.config.ts` では、以下の3項目を必ず `/compass-walk/` に設定します。

```ts
export default defineConfig({
  base: '/compass-walk/',
  plugins: [
    // ...
    VitePWA({
      manifest: {
        start_url: '/compass-walk/',
        scope: '/compass-walk/',
      },
    }),
  ],
})
```

さらに、アプリ内のリンクには `/calendar` や `/record` のような絶対パスを使用しています。これらを GitHub Pages 配下で正しく解決するため、`src/main.tsx` の `BrowserRouter` に Vite の基準パスを渡します。

```tsx
<BrowserRouter basename={import.meta.env.BASE_URL}>
  <App />
</BrowserRouter>
```

この設定がない場合、「予定」を押したときに `https://kazunyon.github.io/calendar` へ移動します。正しい移動先は `https://kazunyon.github.io/compass-walk/calendar` です。同様に「記録」は `/compass-walk/record` になります。

### `vite.config.ts` の import が消えた場合

`vite.config.ts` を GitHub の編集画面で変更する際、ファイル先頭の import を削除しないよう注意してください。次の3行は必須です。

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
```

これらが消えると GitHub Actions の **Build PWA** が失敗し、ログに次のようなエラーが表示されます。

```text
Cannot find name 'defineConfig'
Cannot find name 'react'
Cannot find name 'VitePWA'
```

上記3行を `vite.config.ts` の先頭へ復元して commit・push すると、GitHub Actions が再実行されます。Actions の `Build PWA` と `Deploy to GitHub Pages` が緑のチェックになったことを確認してから、公開URLを開いてください。

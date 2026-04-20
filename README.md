# からだログ

健康管理 / フィットネス / 勤務スケジュール連動 / 継続支援アプリ

## アーキテクチャ概要

### Source of Truth

このアプリの唯一の正本は **Google スプレッドシート** です。

- 共有データと共有設定は、Apps Script 保存成功後にのみ確定します。
- IndexedDB は端末キャッシュ、未送信キュー、端末固有設定の保存先です。
- `pushToCloud()` は「ローカル保存後に await し、成功後に確定する」前提を維持します。
- GAS URL 未設定時、`sharedSettings` は **未保存 / 設定未完了** として扱います。

```text
PWA / Android Health Sync                  Google Apps Script
  ↓ 入力                                     ↓ doPost / doGet
  ↓ localDeviceSettings は即時ローカル保存      ↓ _normalizePayload / _normalizeHealthObject
  ↓ sharedSettings は送信                     ↓ 正規キーへ統一して保存
  ↓ Apps Script 成功で sharedSettings 確定     ↓ getAll / getDate も正規キーだけ返す
  ↓ 失敗時は未送信キュー / warning 状態         ↓ daily_summary を日付単位で再構築
```

## 設定の正式仕様

### sharedSettings

Google スプレッドシート保存対象。Apps Script 保存成功後にのみローカルへ確定します。

- `weeklyGoal`
- `sessionDuration`
- `gymHoursStart`
- `gymHoursEnd`
- `strictness`
- `notifPrep`
- `notifJudge`
- `notifResume`

### localDeviceSettings

端末ローカル保持のみ。Google スプレッドシートへ送信しません。

- `gasSyncUrl`
- `healthProvider`

### 区分一覧

| 項目 | 区分 | 現在の状態 | 保存先 / 備考 |
|------|------|------------|----------------|
| `weeklyGoal` | sharedSettings | 実装済み | スプレッドシート保存。成功後にのみ確定 |
| `sessionDuration` | sharedSettings | 実装済み | スプレッドシート保存。成功後にのみ確定 |
| `gymHoursStart` | sharedSettings | 実装済み | スプレッドシート保存。成功後にのみ確定 |
| `gymHoursEnd` | sharedSettings | 実装済み | スプレッドシート保存。成功後にのみ確定 |
| `strictness` | sharedSettings | 実装済み | スプレッドシート保存。成功後にのみ確定 |
| `notifPrep` | sharedSettings | 実装済み | スプレッドシート保存。成功後にのみ確定 |
| `notifJudge` | sharedSettings | 実装済み | スプレッドシート保存。成功後にのみ確定 |
| `notifResume` | sharedSettings | 実装済み | スプレッドシート保存。成功後にのみ確定 |
| `gasSyncUrl` | localDeviceSettings | 実装済み | 端末ローカルのみ。共有しない |
| `healthProvider` | localDeviceSettings | 実装済み | 端末ローカルのみ。PC は閲覧、Android は Health Connect |
| `theme` | localDeviceSettings | 未実装だが区分固定 | 導入しても端末ローカルのみ |
| `deviceUiState` | localDeviceSettings | 未実装だが区分固定 | タブ開閉など端末ごとの UI 状態 |
| `healthConnectConnectionState` | localDeviceSettings | ランタイム状態 | 権限 / 接続状態。共有しない |
| `dataRetentionDays` | sharedSettings | 未実装だが区分固定 | 将来設定化する場合も shared 扱い |

### 内部メタデータ

以下はユーザー設定ではなく、ローカル管理用キーです。

- `_schemaVersion`
- `_settingsVersion`
- `_pendingDates`
- `_saveStatus`, `_saveStatusContext`, `_saveStatusDetail`, `_saveStatusAt`
- `_settingsUpdatedAt`
- `_lastSyncAt`
- `_rev_*`
- `onboardingDone`

## 正規命名規則

新規保存と新規コードでは、以下の正規キーのみを使用します。

| 項目 | 正規キー | 吸収する旧キー |
|------|----------|----------------|
| 平均心拍 | `heartRateAvg` | `heartRate`, `avgHeartRate` |
| 安静時心拍 | `restingHeartRate` | `restingHR` |
| 健康データソース | `health_connect` | `healthconnect` |

## 旧互換吸収の最終方針

### 主責任点

旧命名吸収の主責任点は **Apps Script 側** です。

- `gas/code.gs` の `_normalizePayload()` と `_normalizeHealthObject()` が、保存前の正規化を担当します。
- `gas/code.gs` の `getAll / getDate / RawData 読み戻し` も正規キーだけ返します。
- フロント新規コードは正規キーしか使いません。

### フロント側に残す互換コード

フロント側に残す互換コードは **移行用途に限定** します。

| ファイル | 役割 | なぜ残すか | 撤去条件 |
|---------|------|------------|----------|
| `js/db.js` `runMigrations()` | 旧ローカルDBの正規化 | 旧端末 / 旧バックアップを起動時に補正するため | `schemaVersion >= 2` / `settingsVersion >= 2` が全端末に行き渡ったら削除可能 |
| `js/db.js` `upsertHealth()` | 旧ローカル入力の最終入口 | import 後や旧ネイティブブリッジ入力を救うため | 旧バックアップと旧入力源の受付終了後に削除可能 |
| `js/views/settings.js` | legacy fallback view | 主導線は `final-views.js` だが、保険用コードも同仕様に維持するため | legacy view を完全撤去する時 |
| `gas/code.gs` `RawData` 保存 / 読み戻し | 旧クライアント互換 | RawData ベース pull が残る移行期間のため | RawData を参照する端末がなくなったら削除可能 |

### フロントから削除したもの

- `app.js` では `healthconnect` 旧値 fallback を持たず、migration 後の正規値だけを使います。
- `sheet-sync.js` では pull 時の旧キー fallback を持たず、GAS が返す正規キーをそのままマージします。

## migration 方針

### バージョン管理

- `schemaVersion`: ローカルDBに残る旧データキーの正規化状態
- `settingsVersion`: `sharedSettings / localDeviceSettings` 境界が正式仕様に揃っている状態

現在値:

- `schemaVersion = 2`
- `settingsVersion = 2`

### 起動時 migration

`js/db.js` の `runMigrations()` で以下を実施します。

1. `healthProvider: healthconnect -> health_connect`
2. `healthRecords.source: healthconnect -> health_connect`
3. `healthRecords.heartRate / avgHeartRate -> heartRateAvg`
4. `healthRecords.restingHR -> restingHeartRate`
5. `_schemaVersion`, `_settingsVersion` を更新

### import 後 migration

`importAll()` の直後にも `runMigrations()` を再実行し、旧バックアップを読み込んだあとにローカル値を正規キーへ寄せます。これにより、毎回 fallback を通る状態を避けます。

## 互換コードの撤去条件

互換コードは永久に残しません。撤去判断は以下です。

1. 全アクティブ端末で `schemaVersion >= 2` かつ `settingsVersion >= 2`
2. 旧ローカルバックアップの再投入が実質なくなった
3. 旧キーを送るネイティブブリッジ / クライアントがなくなった
4. RawData を参照する pull 経路がなくなった

目安:

- `js/db.js` の local migration 互換は次の 2 バージョン以内で再評価
- `gas/code.gs` の RawData 互換は移行完了後に撤去可能
- Apps Script 側の最低限の正規化 helper は、外部入力防御として残存してよい

## daily_summary / workout 再構築方針

維持する前提:

- `daily_summary` は GAS 側で日付単位再構築
- `health_daily / schedule / workout_sessions / workout_details` から `daily_summary` を再構築
- GAS は `daily_summary` に派生列を自動計算する。アプリ側は実績だけを送り、計算済み値を送らない
- 追加計算列: `workMinutes`, `workloadScore`, `sleepHours`, `sleepSessionCount`, `napHours`, `napCount`, `sleepAnchor`, `sleepSummary`, `recoveryScore`, `cardioMinutes`, `strengthSetCount`, `completedSetCount`, `totalSetCount`, `completedExerciseCount`, `totalExerciseCount`, `completionRate`
- `workout_sessions` は開始時刻・終了時刻・実測時間の正本
- `workout_details` はセットごとの実績の正本。トレッドミルは `speedKmh` と `durationMin` を専用列に保存し、旧データは `note` の `5km/h × 6分` 形式から復元
- `workout` と `exercises` は送信時に同じ日付単位で扱う
- タイマーは `startAt` をスプシに保存し、別端末でも同じ経過時間を復元する
- `localStorage` のタイマー値はオフライン・再読込用の補助キャッシュ
- Android Health Connect の直POST後も `daily_summary` を再構築する
- Android Health Connect はバックグラウンド同期時に当日だけでなく直近数日も再送し、圏外や端末停止による取りこぼしを補う
- 睡眠は `sleepMinutes` に加えて、Health Connect の睡眠セッションから `sleepStartAt` / `sleepEndAt` も保存する
- 睡眠の日付は「起きた日」として扱う。例: 4/19 夜〜4/20 朝の睡眠は 4/20 の主睡眠
- 対象日の夜に始まる睡眠は翌日側の主睡眠候補にし、当日分では昼寝扱いしない
- 仮眠は `napSessions` に複数件保存し、GAS が `napCount` と `sleepSummary` を再計算する
- successStreak を使った漸進的負荷ロジックを維持
- バイク削除済み
- トレッドミル中心の有酸素を維持
- 筋トレ表記は `何kg × 何回 × 何セット`
- PC は健康データ閲覧中心

## Web / Android の分担

Web UI は root の HTML/CSS/JS を GitHub Pages で公開します。
Androidアプリは Health Connect 同期専用のネイティブアプリで、WebView と `app/src/main/assets` は使いません。
Web の起動に必要な Dexie / Chart.js は `js/vendor/` に同梱し、CDN障害や弱い通信でも初期表示が止まりにくい構成にします。

### `sync-assets.ps1` の扱い

```powershell
.\sync-assets.ps1
```

現在のAndroid構成では、このコマンドは no-op です。
誤って復活した `android/app/src/main/assets` があれば削除します。
旧WebView構成に一時的に戻す時だけ `.\sync-assets.ps1 -LegacyWebView` を使います。

## 開発手順

### コード修正

1. Web UI は root 側のファイルを編集し、GitHub Pages へ反映する
2. Android は `android/app/src/main/java` と `android/app/src/main/res` を編集する
3. Android Studio でビルドする

### ブラウザ確認

```powershell
npx -y http-server . -p 3000 -c-1
```

### GAS デプロイ

1. `gas/code.gs` を Apps Script エディタへ反映
2. ウェブアプリとして再デプロイ
3. Web は設定画面で `gasSyncUrl` を更新し、Android は `Constants.kt` の `GAS_API_URL` を確認

## 実機確認時の注意点

- Android 実機では、Health Connect 権限付与後に `今すぐ同期` とバックグラウンド同期を確認する
- PC は Health Connect 送信元ではなく、閲覧と比較の導線として確認する
- `gasSyncUrl` 未設定状態では、sharedSettings が warning 表示になり、成功扱いされないことを確認する
- 設定画面で shared / local の境界表示が出ていることを確認する
- Health Connect 連携時、`heartRateAvg / restingHeartRate / health_connect` の正規キーで保存されることを確認する
- 旧バックアップを import した場合、再起動または import 直後に migration が走り、旧キーが正規キーへ寄ることを確認する
- `android/app/src/main/assets` が存在しないことを確認する

## 配布時に除外するもの

```text
.gradle/
.idea/
build/
app/build/
local.properties
*.iml
```

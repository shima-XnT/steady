# Steady Android Health Sync

このAndroidアプリは、画面操作用のPWAではありません。
スマホ側の役割は Health Connect のデータを取得して、Google Apps Script / Googleスプレッドシートへ送る同期専用アプリです。

## 役割

- Health Connect から歩数・睡眠・平均心拍・安静時心拍を取得
- Room に直近データを保存
- WorkManager で15分間隔のバックグラウンド同期を登録
- 端末再起動後は BootReceiver で同期Workerを再登録
- 画面は同期状態、今日の取得値、手動同期、権限付与のみ

## 使わないもの

- WebView
- `PwaBridge`
- `window.SteadyBridge`
- `app/src/main/assets`

Web UI は GitHub Pages 側で使います。Android APK には root の HTML/CSS/JS を入れません。

## GAS API

同期先は `Constants.kt` の `GAS_API_URL` です。

```kotlin
const val GAS_API_URL = "https://script.google.com/macros/s/AKfycbzNwWhfiS536TNOe3-sq9gipfR2hfcMpQf1PkuK-nzTQP5QYnfaijfJNJ1VKsULQRlbZA/exec"
```

## ビルド

1. Android Studio で `D:\デスクトップ\アプリ\健康管理\android` を開く
2. Gradle Sync
3. `Build > Build APK(s)`
4. スマホにインストール
5. アプリを開いて Health Connect 権限を付与

## 動作確認

- アプリ画面で「Health Connect 接続済み」になる
- 「今すぐ同期」で今日の値が取得される
- スプレッドシートの `health_daily` に `source = health_connect` で保存される
- アプリを閉じても WorkManager がバックグラウンドで同期する
- 端末再起動後も BootReceiver により同期が再登録される

Androidのバックグラウンド実行はOSの省電力制御を受けます。15分は最短間隔で、実行時刻は端末状態により前後します。

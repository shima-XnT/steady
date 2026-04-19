# Steady Android Wrapper

このプロジェクトは、既存のPWA「Steady」に対して、Androidの Health Connect SDK連携を追加するためのネイティブラッパーです。

## 特徴
- PWA本体はそのまま（WebView経由で表示）
- ネイティブレイヤーで Health Connect API を叩く
- JavaScriptBridge (`window.SteadyBridge`) を介してPWAにデータを流し込む
- 自動同期に対応できるよう Room データベースを内蔵

## ビルド環境
- Android Studio Iguana / Jellyfish 以降を推奨
- ターゲット API: 34 (Android 14)
- 必須: 端末に Health Connect アプリがインストールされていること（Android 14以降はシステム標準）

## 連携確認手順

1. **PC側の準備（開発時のみ）**
   PWA側の開発サーバーを `localhost:3000` で立ち上げておきます。
   ```bash
   npx serve . -l 3000 --cors
   ```

2. **Android側エミュレータ準備**
   - エミュレータでブラウザを開き、Play ストアから「Health Connect」アプリをインストールします。（あるいは Android 14 のエミュレータを使用）
   - Health Connectアプリ内でモックの步数や睡眠データを登録しておきます。

3. **Android Studio でビルド・実行**
   - Android Studio で `d:\デスクトップ\アプリ\健康管理\android` を開く
   - Gradle Sync を実行
   - エミュレータでアプリを実行
   - **注意:** エミュレータの `10.0.2.2` はPCの `localhost` に繋がります。

4. **アプリでの確認**
   - 画面が立ち上がり、PWAが表示されます。
   - 初期起動時に設定画面へ誘導され、「権限を許可」ボタンが表示されます。
   - ボタンを押して Health Connect の権限を全て許可してください。
   - もう一度「🔄 今すぐ同期」を押すか、ホームに戻るとデータが最新のものに更新されます。

## 製品版ビルドへの切り替え
リリース時は、`Constants.kt` の `PWA_URL` を変更し、PWAのHTML/JS/CSSファイルを `app/src/main/assets/` にパッキングすることで、スタンドアロンのAndroidアプリとして配布可能です。

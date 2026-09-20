# 【公式】eie.jp サイト運用 ＆ 公式ポータル開発ガイドライン

本ファイルは、木造構造計算オープンクラウド「上善如水 壁量計算WEB」の公式製品紹介・実務Q&Aポータル（`https://eie.jp`）の運用基準書です。
詳細な制作基準およびアカウント情報は [SNS_GUIDELINES.md](../SNS_GUIDELINES.md) をご参照ください。

## 公式ドメイン体制
- **公式製品紹介 ＆ 実務Q&Aポータル（本サイト）**: `https://eie.jp`（全体概要・操作解説動画・実務Q&A・不具合解消速報）
- **プログラム本体（Webアプリ）**: `https://2025.eie.jp`（即起動・ブラウザ型木造構造計算ツール本体）
- **法人管理・BtoB窓口**: `https://pr.eie.tokyo`（国税庁API連携・独立運用基盤）

## チケット受付・ファイル添付 ＆ エージェント自動解析仕様
- **管理者通知先メールアドレス**: `support@eie.tokyo`
- **添付ファイル対応形式**: `.dxf`, `.json`, `.png`, `.jpg`, `.jpeg`, `.txt`, `.log`, `.zip`（合計最大20MB）
- **サーバー側保存先**: `eie.jp/public_html/uploads/tickets/{ticket_id}/`
- **セキュリティ**: `.htaccess` により `uploads/` 内のスクリプト直接実行を完全無効化。
- **エージェント自動診断・修正計画生成コマンド**:
  ```bash
  node sns_portal/scripts/inspect_ticket.js --list  # 未解析一覧表示
  node sns_portal/scripts/inspect_ticket.js 1       # [1]番を解析
  node sns_portal/scripts/inspect_ticket.js --all   # 未解析全件を一括解析
  ```

## 【最重要・厳格義務】修正作業完了時の本番サーバー同期
**AIエージェントおよび開発者は、本リポジトリ（`sns_portal`）のファイル（HTML、CSS、JS、PHP、Q&Aデータ、画像、Favicon等）を変更・追加した際は、ユーザーへ作業完了を報告する前に必ず以下のコマンドを実行し、本番サーバー（`https://eie.jp`）への同期を完了させてください。ローカルの編集だけで作業完了としてはなりません。**

### デプロイ＆本番サーバー同期コマンド（必須実行手順）
```bash
# 1. ローカルでコミット＆GitHubへプッシュ
git add .
git commit -m "Update eie.jp portal: <更新内容の要約>"
git push origin main

# 2. XServer本番環境へ即時同期（SSH経由でgit pull）
ssh -o BatchMode=yes -p 10022 mdo3@mdo3.xsrv.jp "cd eie.jp/public_html && git pull origin main"
```

※PowerShell環境で1行実行する場合：
```powershell
git add .; git commit -m "Update eie.jp portal: <更新内容>"; git push origin main; ssh -o BatchMode=yes -p 10022 mdo3@mdo3.xsrv.jp "cd eie.jp/public_html && git pull origin main"
```

### サーバーディレクトリ構造と安全上の注意
- 本番サーバーの配置先は `/home/mdo3/eie.jp/public_html/` です。
- 同ディレクトリ直下には、本体プログラム用ディレクトリ `/home/mdo3/eie.jp/public_html/2025/` が存在します。
- リポジトリの `.gitignore` に `/2025/` が登録されており、本体プログラムと絶対に衝突・干渉しないよう安全管理されています。




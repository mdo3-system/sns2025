# 【公式】sns.eie.tokyo サイト運用 ＆ SNS制作ガイドライン

本ファイルは `sns.eie.tokyo` のリポジトリ内で管理される運用基準書です。
詳細な制作基準およびアカウント情報は [SNS_GUIDELINES.md](../SNS_GUIDELINES.md) をご参照ください。

## 公式ドメイン体制
- **プログラム本体（Webアプリ）**: `https://2025.eie.jp`（即起動・計算実行）
- **実務・紹介・Q&Aポータル（本サイト）**: `https://sns.eie.tokyo`（実務Q&A・不具合解消速報・操作解説）
- ※法人一括管理用BtoB窓口（`https://pr.eie.tokyo`）は、本ポータル（sns.eie.tokyo）には掲載せず独立運用。

## チケット受付・ファイル添付 ＆ エージェント自動解析仕様
- **管理者通知先メールアドレス**: `support@eie.tokyo`
- **添付ファイル対応形式**: `.dxf`, `.json`, `.png`, `.jpg`, `.jpeg`, `.txt`, `.log`, `.zip`（合計最大20MB）
- **サーバー側保存先**: `eie.tokyo/public_html/sns/uploads/tickets/{ticket_id}/`
- **セキュリティ**: `.htaccess` により `uploads/` 内のスクリプト直接実行を完全無効化。
- **エージェント自動診断・修正計画生成コマンド**:
  ```bash
  node sns_portal/scripts/inspect_ticket.js --list  # 未解析一覧表示
  node sns_portal/scripts/inspect_ticket.js 1       # [1]番を解析
  node sns_portal/scripts/inspect_ticket.js --all   # 未解析全件を一括解析
  ```

## 【最重要・厳格義務】修正作業完了時の本番サーバー同期
**AIエージェントおよび開発者は、本リポジトリ（`sns_portal`）のファイル（HTML、CSS、JS、PHP、Q&Aデータ、画像等）を変更・追加した際は、ユーザーへ作業完了を報告する前に必ず以下のコマンドを実行し、本番サーバー（`https://sns.eie.tokyo`）への同期を完了させてください。ローカルの編集だけで作業完了としてはなりません。**

### デプロイ＆本番サーバー同期コマンド（必須実行手順）
```bash
# 1. ローカルでコミット＆GitHubへプッシュ
git add .
git commit -m "Update sns.eie.tokyo: <更新内容の要約>"
git push origin main

# 2. XServer本番環境へ即時同期（SSH経由でgit pull）
ssh -o BatchMode=yes -p 10022 mdo3@mdo3.xsrv.jp "cd eie.tokyo/public_html/sns && git pull origin main"
```

※PowerShell環境で1行実行する場合：
```powershell
git add .; git commit -m "Update sns.eie.tokyo: <更新内容>"; git push origin main; ssh -o BatchMode=yes -p 10022 mdo3@mdo3.xsrv.jp "cd eie.tokyo/public_html/sns && git pull origin main"
```



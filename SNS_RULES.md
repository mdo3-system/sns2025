# 【公式】sns.eie.tokyo サイト運用 ＆ SNS制作ガイドライン

本ファイルは `sns.eie.tokyo` のリポジトリ内で管理される運用基準書です。
詳細な制作基準およびアカウント情報は [SNS_GUIDELINES.md](../SNS_GUIDELINES.md) をご参照ください。

## 公式ドメイン体制
- **プログラム本体（Webアプリ）**: `https://2025.eie.jp`（即起動・計算実行）
- **実務・紹介・Q&Aポータル（本サイト）**: `https://sns.eie.tokyo`（実務Q&A・不具合解消速報・操作解説）
- ※法人一括管理用BtoB窓口（`https://pr.eie.tokyo`）は、本ポータル（sns.eie.tokyo）には掲載せず独立運用。

## デプロイ＆本番サーバー同期コマンド
```bash
# ローカルでコミット＆プッシュ
git add .
git commit -m "Update sns.eie.tokyo assets and content"
git push origin main

# XServer本番環境へ完全同期
ssh -o BatchMode=yes -p 10022 mdo3@mdo3.xsrv.jp "cd eie.tokyo/public_html/sns && git pull origin main"
```

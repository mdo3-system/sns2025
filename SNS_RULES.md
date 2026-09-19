# 【公式】sns.eie.tokyo サイト運用 ＆ SNS制作ガイドライン

本ファイルは `sns.eie.tokyo` のリポジトリ内で管理される運用基準書です。
詳細な制作基準およびアカウント情報は [SNS_GUIDELINES.md](../SNS_GUIDELINES.md) をご参照ください。

## 3大公式ドメイン
- **プログラム本体（Webアプリ）**: `https://2025.eie.jp`
- **個人・紹介ポータル（本サイト）**: `https://sns.eie.tokyo`
- **工務店・法人契約ポータル**: `https://pr.eie.tokyo`

## デプロイ＆本番サーバー同期コマンド
```bash
# ローカルでコミット＆プッシュ
git add .
git commit -m "Update sns.eie.tokyo assets and content"
git push origin main

# XServer本番環境へ完全同期
ssh -o BatchMode=yes -p 10022 mdo3@mdo3.xsrv.jp "cd eie.tokyo/public_html/sns && git pull origin main"
```

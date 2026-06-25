#!/bin/bash
# 可靠分块部署脚本（针对会重置长连接的服务器）。
# 用法：bash deploy/redeploy.sh
set -euo pipefail

KEY=${DEPLOY_KEY:-/c/Users/admin/.ssh/id_ed25519}
HOST=${DEPLOY_HOST:-154.3.39.114}
USER=${DEPLOY_USER:-root}
REMOTE_DIR=${DEPLOY_DIR:-/root/LLM-Workbench}
PROJECT=llm-workbench
TARGET="$USER@$HOST"
SSH_OPTS="-o StrictHostKeyChecking=no -o ServerAliveInterval=10 -o ServerAliveCountMax=3 -o ConnectTimeout=30"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== 1/6 打包源码 ==="
TAR=/tmp/llm-workbench-deploy.tar.gz
( cd "$ROOT" && tar -czf "$TAR" \
    --exclude='node_modules' --exclude='target' --exclude='dist' \
    --exclude='.git' --exclude='.idea' --exclude='.vscode' --exclude='*.log' \
    backend frontend docker-compose.yml )
LOCAL_MD5=$(md5sum "$TAR" | cut -d' ' -f1)
echo "包大小 $(wc -c < "$TAR") bytes, md5=$LOCAL_MD5"

echo "=== 2/6 base64 + 分块 ==="
cd /tmp
base64 "$TAR" > deployment.b64
rm -rf chunks && mkdir chunks && split -b 50000 deployment.b64 chunks/part_
echo "分块数 $(ls chunks | wc -l)"

echo "=== 3/6 准备远端 ==="
ssh -i "$KEY" $SSH_OPTS "$TARGET" "rm -f /tmp/deployment.b64 $TAR; rm -rf /tmp/wbchunks; mkdir -p /tmp/wbchunks; echo READY"

echo "=== 4/6 逐块上传(独立文件+逐块校验) ==="
for chunk in /tmp/chunks/part_*; do
  name=$(basename "$chunk")
  lmd5=$(md5sum "$chunk" | cut -d' ' -f1)
  for attempt in 1 2 3 4 5 6; do
    if cat "$chunk" | ssh -i "$KEY" $SSH_OPTS "$TARGET" "cat > /tmp/wbchunks/$name" 2>/dev/null; then
      rmd5=$(ssh -i "$KEY" $SSH_OPTS "$TARGET" "md5sum /tmp/wbchunks/$name 2>/dev/null | cut -d' ' -f1" 2>/dev/null || true)
      [ "$lmd5" = "$rmd5" ] && { echo "OK $name (try $attempt)"; break; }
    fi
    [ $attempt -eq 6 ] && { echo "FAIL $name"; exit 1; }
    sleep 2
  done
done

echo "=== 5/6 合并校验 + 解压 ==="
RMD5=$(ssh -i "$KEY" $SSH_OPTS "$TARGET" "
cat /tmp/wbchunks/part_* > /tmp/deployment.b64
base64 -d /tmp/deployment.b64 > $TAR
md5sum $TAR | cut -d' ' -f1")
echo "远端 md5=$RMD5"
[ "$LOCAL_MD5" = "$RMD5" ] || { echo "MD5 不匹配，中止"; exit 1; }
ssh -i "$KEY" $SSH_OPTS "$TARGET" "
cd $REMOTE_DIR 2>/dev/null || mkdir -p $REMOTE_DIR && cd $REMOTE_DIR
rm -rf backend frontend docker-compose.yml
tar -xzf $TAR -C $REMOTE_DIR
echo extracted: \$(ls)"

echo "=== 6/6 后台构建启动 ==="
ssh -i "$KEY" $SSH_OPTS "$TARGET" "
cd $REMOTE_DIR
rm -f build.log build.done
nohup bash -c 'cd $REMOTE_DIR && docker compose -p $PROJECT up -d --build > build.log 2>&1; echo EXIT_\$? >> build.log; touch build.done' >/dev/null 2>&1 &
echo BUILD_STARTED"
echo "构建已在后台启动，轮询 build.done / build.log 查看进度。"

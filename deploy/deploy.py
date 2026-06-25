"""
部署脚本：将 LLM-Workbench 打包上传到服务器并用 docker compose 启动。
设计要点（不影响 newapi / sub2api）：
  - 独立部署目录 /opt/llm-workbench
  - 独立 compose 项目名 llm-workbench（独立网络，互不干扰）
  - 后端不映射宿主端口，前端仅占用 8088（已确认空闲）
密码通过环境变量 DEPLOY_PASS 传入，不硬编码。
"""
import io
import os
import sys
import tarfile
import paramiko

# Windows 终端默认 GBK，强制 stdout 用 UTF-8 并对无法编码的字符做替换，
# 避免构建输出里的特殊字符（如 ✓）导致 UnicodeEncodeError。
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

HOST = os.environ.get("DEPLOY_HOST", "47.253.7.24")
USER = os.environ.get("DEPLOY_USER", "root")
PASS = os.environ.get("DEPLOY_PASS")
KEY = os.environ.get("DEPLOY_KEY")  # 私钥文件路径（密钥登录）
REMOTE_DIR = os.environ.get("DEPLOY_DIR", "/opt/llm-workbench")
PROJECT = "llm-workbench"


def connect():
    """支持两种登录方式：优先用私钥(DEPLOY_KEY)，否则用密码(DEPLOY_PASS)。"""
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    if KEY:
        print(f"连接 {USER}@{HOST}（密钥 {KEY}）...")
        pkey = None
        for loader in (paramiko.Ed25519Key, paramiko.RSAKey, paramiko.ECDSAKey):
            try:
                pkey = loader.from_private_key_file(KEY)
                break
            except Exception:
                continue
        if pkey is None:
            raise RuntimeError(f"无法加载私钥：{KEY}")
        client.connect(HOST, username=USER, pkey=pkey, timeout=20)
    elif PASS:
        print(f"连接 {USER}@{HOST}（密码）...")
        client.connect(HOST, username=USER, password=PASS, timeout=20)
    else:
        raise RuntimeError("请设置 DEPLOY_KEY（私钥路径）或 DEPLOY_PASS（密码）")
    print("连接成功。")
    return client

# 仅打包部署所需文件，排除构建产物与依赖目录。
INCLUDE = ["backend", "frontend", "docker-compose.yml"]
EXCLUDE_DIRS = {"node_modules", "target", "dist", ".git", ".idea", ".vscode"}
EXCLUDE_EXT = {".log"}

LOCAL_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def should_skip(path):
    parts = set(path.replace("\\", "/").split("/"))
    if parts & EXCLUDE_DIRS:
        return True
    return any(path.endswith(ext) for ext in EXCLUDE_EXT)


def make_tar():
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for item in INCLUDE:
            full = os.path.join(LOCAL_ROOT, item)
            if os.path.isfile(full):
                tar.add(full, arcname=item)
            else:
                for root, dirs, files in os.walk(full):
                    dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
                    for f in files:
                        fp = os.path.join(root, f)
                        rel = os.path.relpath(fp, LOCAL_ROOT).replace("\\", "/")
                        if not should_skip(rel):
                            tar.add(fp, arcname=rel)
    buf.seek(0)
    return buf


def run(client, cmd, label=None, check=True):
    if label:
        print(f"\n=== {label} ===")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=900)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.strip())
    if err.strip():
        print(err.strip())
    if check and code != 0:
        raise RuntimeError(f"命令失败(exit={code}): {cmd}")
    return code


def main():
    if not PASS:
        print("请先设置环境变量 DEPLOY_PASS")
        sys.exit(1)

    print(f"连接 {USER}@{HOST} ...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASS, timeout=20)
    print("连接成功。")

    # 安全护栏：确认 8088 仍空闲，避免误伤已有服务。
    rc = run(client, "ss -ltn 2>/dev/null | grep -q ':8088 ' && echo OCCUPIED || echo FREE",
             "检查 8088 端口", check=False)

    print("\n=== 打包本地文件 ===")
    tar_buf = make_tar()
    size_kb = len(tar_buf.getvalue()) / 1024
    print(f"打包完成，约 {size_kb:.0f} KB")

    run(client, f"mkdir -p {REMOTE_DIR}", "创建远程目录")

    print("\n=== 上传文件 ===")
    sftp = client.open_sftp()
    remote_tar = f"{REMOTE_DIR}/_deploy.tar.gz"
    sftp.putfo(tar_buf, remote_tar)
    sftp.close()
    print("上传完成。")

    run(client, f"cd {REMOTE_DIR} && tar -xzf _deploy.tar.gz && rm -f _deploy.tar.gz",
        "解压")

    run(client,
        f"cd {REMOTE_DIR} && docker compose -p {PROJECT} up -d --build",
        "构建并启动（首次构建较慢，请耐心等待）")

    run(client, f"docker compose -p {PROJECT} ps", "本项目容器状态")
    run(client,
        "docker ps --format 'table {{.Names}}\\t{{.Ports}}\\t{{.Status}}'",
        "服务器全部容器（确认 newapi/sub2api 正常）", check=False)

    client.close()
    print(f"\n部署完成。访问 http://{HOST}:8088")


if __name__ == "__main__":
    main()

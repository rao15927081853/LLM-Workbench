"""
基于 Git 的部署脚本：在服务器上从 GitHub 拉取本项目并用 docker compose 部署。
适配该服务器会重置长连接的特性：
  - 每个远程命令带「连接级」重试（连不上就重连重试）
  - 构建放后台 nohup 执行，轮询 build.done，避免 SSH 断连中断构建

环境变量（均有默认值）：
  DEPLOY_HOST  服务器 IP（默认 154.3.39.114）
  DEPLOY_USER  登录用户（默认 root）
  DEPLOY_KEY   私钥路径（默认 ~/.ssh/id_ed25519）
  DEPLOY_DIR   远程部署目录（默认 /root/LLM-Workbench）
  REPO_URL     Git 仓库地址
  REPO_BRANCH  分支（默认 main）
"""
import os
import sys
import time
import socket
import paramiko

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

HOST = os.environ.get("DEPLOY_HOST", "154.3.39.114")
USER = os.environ.get("DEPLOY_USER", "root")
KEY = os.environ.get("DEPLOY_KEY", os.path.expanduser("~/.ssh/id_ed25519"))
REMOTE_DIR = os.environ.get("DEPLOY_DIR", "/root/LLM-Workbench")
REPO_URL = os.environ.get("REPO_URL", "https://github.com/rao15927081853/LLM-Workbench.git")
REPO_BRANCH = os.environ.get("REPO_BRANCH", "main")
PROJECT = "llm-workbench"


def load_key(path):
    for loader in (paramiko.Ed25519Key, paramiko.RSAKey, paramiko.ECDSAKey):
        try:
            return loader.from_private_key_file(path)
        except Exception:
            continue
    raise RuntimeError(f"无法加载私钥：{path}")


def connect():
    """建立 SSH 连接（带 keepalive，缓解长连接被重置）。"""
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    pkey = load_key(KEY)
    client.connect(HOST, username=USER, pkey=pkey, timeout=30,
                   banner_timeout=30, auth_timeout=30)
    client.get_transport().set_keepalive(10)
    return client


_client = None


def get_client(force_new=False):
    global _client
    if force_new and _client is not None:
        try:
            _client.close()
        except Exception:
            pass
        _client = None
    if _client is None:
        _client = connect()
    return _client


def run(cmd, label=None, check=True, timeout=120, retries=5):
    """执行远程命令；遇到连接级故障自动重连重试。返回 (code, out, err)。"""
    if label:
        print(f"\n=== {label} ===")
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            client = get_client()
            stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
            out = stdout.read().decode("utf-8", "replace")
            err = stderr.read().decode("utf-8", "replace")
            code = stdout.channel.recv_exit_status()
            if out.strip():
                print(out.strip())
            if err.strip():
                print(err.strip())
            if check and code != 0:
                raise RuntimeError(f"命令失败(exit={code}): {cmd}")
            return code, out, err
        except (paramiko.SSHException, socket.error, EOFError, OSError) as e:
            last_err = e
            print(f"  连接异常(尝试 {attempt}/{retries}): {e}，重连重试...")
            get_client(force_new=True)
            time.sleep(3)
    raise RuntimeError(f"命令多次失败：{cmd}\n最后错误：{last_err}")


def main():
    print(f"连接 {USER}@{HOST}（密钥 {KEY}）...")
    get_client()
    print("连接成功。")

    run("docker --version && docker compose version | head -1 && git --version",
        "检查 docker / git", timeout=60)

    # 准备仓库：已是 git 仓库则 fetch+reset，否则清空重新 clone。
    prepare = f"""
set -e
if [ -d {REMOTE_DIR}/.git ]; then
  echo "已是 git 仓库，执行 fetch + reset"
  cd {REMOTE_DIR}
  git fetch --depth 1 origin {REPO_BRANCH}
  git reset --hard origin/{REPO_BRANCH}
  git clean -fd
else
  echo "非 git 仓库，清空后重新 clone"
  rm -rf {REMOTE_DIR}
  git clone --depth 1 -b {REPO_BRANCH} {REPO_URL} {REMOTE_DIR}
fi
cd {REMOTE_DIR}
echo "当前 commit: $(git rev-parse HEAD)"
"""
    run(prepare, "拉取代码", timeout=180)

    # 后台构建，轮询 build.done，避免断连中断。
    start_build = f"""
cd {REMOTE_DIR}
rm -f build.log build.done
nohup bash -c 'cd {REMOTE_DIR} && docker compose -p {PROJECT} up -d --build > build.log 2>&1; echo EXIT_$? >> build.log; touch build.done' >/dev/null 2>&1 &
echo "BUILD_STARTED"
"""
    run(start_build, "后台构建启动", timeout=60)

    print("\n=== 轮询构建进度（最多约 12 分钟）===")
    deadline = time.time() + 12 * 60
    done = False
    while time.time() < deadline:
        time.sleep(20)
        code, out, _ = run(
            f"if [ -f {REMOTE_DIR}/build.done ]; then echo DONE; else echo RUNNING; fi; "
            f"tail -n 3 {REMOTE_DIR}/build.log 2>/dev/null",
            check=False, timeout=60)
        if "DONE" in out:
            done = True
            break
    if not done:
        print("构建超时（未在限定时间内完成），请手动检查 build.log。")
        sys.exit(2)

    # 确认构建退出码
    _, out, _ = run(f"grep -o 'EXIT_[0-9]*' {REMOTE_DIR}/build.log | tail -1",
                    "构建结果", check=False, timeout=60)
    if "EXIT_0" not in out:
        print("构建失败，最后 30 行日志：")
        run(f"tail -n 30 {REMOTE_DIR}/build.log", check=False, timeout=60)
        sys.exit(3)

    run(f"docker compose -p {PROJECT} ps --format 'table {{{{.Name}}}}\\t{{{{.Status}}}}'",
        "容器状态", check=False, timeout=60)
    run("curl -s -o /dev/null -w 'frontend HTTP %{http_code}\\n' http://localhost:8088/",
        "前端连通性", check=False, timeout=60)

    print(f"\n部署完成。访问 http://{HOST}:8088")
    try:
        get_client().close()
    except Exception:
        pass


if __name__ == "__main__":
    main()

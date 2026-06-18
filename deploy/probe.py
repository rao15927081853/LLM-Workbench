"""
只读探测脚本：检查服务器环境，不做任何修改。
用途：确认 docker/compose 可用，查看端口占用，避免与 newapi / sub2api 冲突。
密码通过环境变量 DEPLOY_PASS 传入，不硬编码。
"""
import os
import sys
import paramiko

HOST = os.environ.get("DEPLOY_HOST", "47.253.7.24")
USER = os.environ.get("DEPLOY_USER", "root")
PASS = os.environ.get("DEPLOY_PASS")

if not PASS:
    print("请先设置环境变量 DEPLOY_PASS")
    sys.exit(1)

CMDS = [
    ("操作系统", "cat /etc/os-release 2>/dev/null | head -2 | tr '\\n' ' '"),
    ("docker 版本", "docker --version 2>&1"),
    ("compose 版本", "docker compose version 2>&1 || docker-compose --version 2>&1"),
    ("运行中的容器", "docker ps --format 'table {{.Names}}\\t{{.Ports}}\\t{{.Status}}' 2>&1"),
    ("监听端口(TCP)", "ss -ltnp 2>/dev/null | awk 'NR>1{print $4}' | sed 's/.*://' | sort -un | tr '\\n' ' '"),
    ("8088 是否占用", "ss -ltn 2>/dev/null | grep -q ':8088 ' && echo OCCUPIED || echo FREE"),
    ("磁盘空间", "df -h / | tail -1"),
    ("/opt 目录", "ls -la /opt 2>/dev/null | head -20"),
]


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"连接 {USER}@{HOST} ...")
    client.connect(HOST, username=USER, password=PASS, timeout=20)
    print("连接成功。\n")
    for label, cmd in CMDS:
        stdin, stdout, stderr = client.exec_command(cmd, timeout=30)
        out = stdout.read().decode("utf-8", "replace").strip()
        err = stderr.read().decode("utf-8", "replace").strip()
        print(f"=== {label} ===")
        print(out if out else "(空)")
        if err and "Warning" not in err:
            print(f"[stderr] {err}")
        print()
    client.close()


if __name__ == "__main__":
    main()

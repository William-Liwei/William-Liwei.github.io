---
title: 如何开发基于 Streamlit 和 SQLite 的数据库管理工具
date: 2025-02-18 23:19:26
tags: [Python, Streamlit, SQLite, 数据库管理]
---

## 用 Streamlit 和 SQLite 构建高效数据库管理工具

在数据驱动的开发中，数据库管理是一个不可或缺的环节。最近，我开发了一个基于 Python 的简单数据库管理工具，用于管理和展示石窟艺术数据。这个项目不仅帮助我巩固了对 Streamlit 和 SQLite 的理解，还让我体会到了快速开发工具的强大能力。

### 项目背景

我们的目标是创建一个简单易用的工具，用于管理和展示石窟艺术数据。这些数据存储在一个 SQLite 数据库中，包括雕塑的时期、洞窟名称、洞窟编号、来源、地区以及相关的图片等信息。为了实现这一目标，我选择了 Python 的 Streamlit 框架，因为它能够快速搭建交互式 Web 应用。

<!--more-->

### 技术栈

- **Python**：作为开发语言，简洁且功能强大。
- **Streamlit**：用于构建交互式 Web 界面。
- **SQLite**：轻量级数据库，适合小型项目。

### 功能实现

#### 1. 数据库操作

我封装了几个关键的数据库操作函数，包括查询、插入/更新和删除记录。以下是部分代码示例：

```python
def query_database(period=None, cave_name=None, cave_number=None, source=None, region=None):
    conn = sqlite3.connect(sqlite_db_path)
    cursor = conn.cursor()
    query = "SELECT * FROM BuddhaSculptures"
    params = []
    conditions = []

    if period:
        conditions.append("period = ?")
        params.append(period)
    if cave_name:
        conditions.append("cave_name = ?")
        params.append(cave_name)
    if cave_number:
        conditions.append("cave_number = ?")
        params.append(cave_number)
    if source:
        conditions.append("source = ?")
        params.append(source)
    if region:
        conditions.append("region = ?")
        params.append(region)

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    cursor.execute(query, params)
    results = cursor.fetchall()
    cursor.close()
    conn.close()
    return results
```

这些函数通过 SQLite 的 Python 接口实现了对数据库的基本操作。

#### 2. Streamlit 界面开发

Streamlit 的界面开发非常直观。我通过简单的表单和按钮实现了查询、添加/更新和删除记录的功能。以下是部分界面代码：

```python
st.subheader("Query Records")
period = st.text_input("Period")
cave_name = st.text_input("Cave Name")
# 其他输入框...
if st.button("Query"):
    results = query_database(period, cave_name, cave_number, source, region)
    if results:
        st.write(f"Found {len(results)} results:")
        for row in results:
            st.write(f"ID: {row[0]}, Period: {row[5]}, Cave Name: {row[3]}")
            image_data = row[-1]
            image = display_image_from_blob(image_data)
            if image:
                st.image(image, caption=f"Image ID: {row[0]}", use_container_width=True)
            else:
                st.write("No image available.")
    else:
        st.write("No results found.")
```

通过 Streamlit 提供的组件，如 `st.text_input` 和 `st.button`，用户可以轻松进行数据查询。

#### 3. 图片处理

为了支持图片的上传和展示，我使用了 `Pillow` 库来处理图片数据，并将其以 BLOB 格式存储在数据库中。以下是图片展示的代码：

```python
def display_image_from_blob(blob_data):
    if blob_data:
        image_bytes = io.BytesIO(blob_data)
        image = Image.open(image_bytes)
        return image
    else:
        return None
```

通过这种方式，用户可以方便地上传图片，并在查询时直接查看图片内容。

### 项目运行

为了方便启动项目，我编写了一个启动脚本 `db_start_streamlit.py`，它会检查环境变量，确保 Streamlit 只运行一次。以下是启动脚本的核心代码：

```python
if __name__ == "__main__":
    if os.environ.get(ENV_FLAG) is None:
        os.environ[ENV_FLAG] = "1"
        os.system("streamlit run db_streamlit.py")
    else:
        print("Streamlit is already running.")
```

通过这个脚本，用户只需运行一个命令即可启动整个应用。

### 总结

通过这个项目，我不仅巩固了 Python 和 SQLite 的开发技能，还学习了如何使用 Streamlit 构建简单的 Web 应用。这个工具虽然简单，但已经能够满足我们对石窟艺术数据的基本管理需求。未来，我计划进一步优化界面设计，并尝试将数据迁移到更强大的数据库系统中，以支持更大的数据量和更复杂的查询。

如果你对这个项目感兴趣，或者有类似的开发需求，欢迎与我交流！

------

**附录**

- [Streamlit 官方文档](https://docs.streamlit.io/) 
- [SQLite 官方文档](https://www.sqlite.org/docs.html) 
- [Pillow 官方文档](https://pillow.readthedocs.io/en/stable/)
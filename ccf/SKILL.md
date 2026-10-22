---
name: ccfonline
description: Query CCF Online for academic conference deadlines, CCF recommended conference and journal rankings, and journal partitions using its existing browser interface. Use for conference names, journal names or ISSNs, and filtered venue searches.
---

# CCF Online

Use the existing public website: https://www.weili.space/ccf/

The site is independent of CCF. No login or API key is required. This skill is a usage guide, not an API or an MCP server.

## Query the website

1. Open a query URL in a JavaScript-capable browser. The initial HTML alone does not contain the results; query parameters configure the browser UI, not a server-side search API.
2. Wait for `#panel` to have `aria-busy="false"`. Read the result count (`#result-count`), table headings and rows (`#thead`, `#tbody`), and the data note (`#data-note`). Check `#data-warning` for stale data or refresh failures. A loading error is not a zero-result search.
3. Adjust the visible filters or URL parameters as needed. On mobile, expand “筛选条件”. Results have 50 rows per page; use “下一页” or `p=2`, `p=3`, etc. when the requested scope requires more rows.
4. Return the relevant records with the filtered CCF Online URL. For decisions about submission dates, also include the linked conference website when available.

Always specify `tab` in a query URL so saved browser preferences do not change the query. URL-encode search text and non-ASCII filter values. Use `all` to remove a categorical filter. Search by a name, abbreviation or ISSN; do not assume Boolean or semantic search. Journal ISSNs work with or without their hyphen; abbreviations are available where linked from the CCF list. If a search has no results, “清除筛选，保留关键词” restores default filters without deleting the query.

## Query parameters

Base URL: `https://www.weili.space/ccf/`

| Task | Parameters |
| --- | --- |
| Conference deadlines | `tab=conf`; `q` for abbreviation or full name; `sub` for field; `rank=A`, `B`, `C` or `N`; `status=open`, `week`, `month`, `passed` or `tbd`; `latest=1` for the latest edition (default), `latest=0` for all years; `tz=bj` for Beijing time (default), `orig` for original conference time, `local` for the browser's timezone. |
| CCF recommended list | `tab=ccf`; `q` for name or publisher; `level=A`, `B` or `C`; `type=会议` or `期刊`; `cat` and `pub` use exact values shown in the field and publisher dropdowns. |
| Journal partitions | `tab=jcr`; `q` for journal name, ISSN or eISSN; `quart=Q1` through `Q4`; `cas=1` through `4`; `xr=1` through `4`; `ccf=any`, `A`, `B` or `C`; `top=1` for CAS Top; `nowarn=1` to exclude warning-listed journals. |

Conference field codes: `AI` artificial intelligence; `CG` graphics and multimedia; `CT` theory; `DB` databases, data mining and information retrieval; `DS` architecture, parallel/distributed computing and storage; `HI` HCI and ubiquitous computing; `MX` interdisciplinary; `NW` networks; `SC` security; `SE` software engineering, systems and programming languages.

`status=week` means within 7 days; `status=month` means within 30 days. For an arbitrary range such as 90 days, start with `status=open` and inspect the displayed absolute deadlines; there is no `days=90` parameter. `latest=1` is an edition filter, not a guarantee that a conference is still accepting submissions.

Examples:

- KDD deadlines: https://www.weili.space/ccf/?tab=conf&q=KDD&latest=1&tz=bj
- AI, CCF-A, closing within 30 days: https://www.weili.space/ccf/?tab=conf&sub=AI&rank=A&status=month&tz=bj
- KDD in the CCF list: https://www.weili.space/ccf/?tab=ccf&q=KDD
- Journal by ISSN: https://www.weili.space/ccf/?tab=jcr&q=0167-8655

## Interpret results

- Report the conference's full name, edition/year, CCF rank, requested deadline and timezone. Equal abbreviations can identify different venues (for example the two FSE conferences); use the full name and field to disambiguate. Distinguish abstract and full-paper deadlines, multiple submission rounds, and the conference dates. Expand “查看各轮时间” for all supplied rounds; native details are closed initially. “待公布” and “未提供” are unknown, not inferred dates. “全文未截稿” alone does not establish that a new submission is possible: when “摘要已截止” is shown, check the official abstract-registration rules.
- Use `tz=bj` for Beijing time. The browser's local timezone may differ from the user's. Preserve absolute dates rather than relying only on countdowns.
- Keep CCF rank, JCR quartile, CAS partition and XR partition separate. The displayed JCR quartile is the journal's best quartile across its JCR categories. Filtering by a category does not change this best-quartile value; do not claim it is necessarily that category's quartile. Read edition years from the page's data note; missing values are not zero. Prefer ISSN/eISSN to disambiguate similar journal names.
- Acceptance rates may refer to a different year from the listed conference edition. Preserve the displayed rate year.
- Mention the displayed update time or edition years, and any stale-data warning relevant to the answer. Browser refresh can differ from the bundled snapshot; do not call all results real-time.
- If the browser cannot run JavaScript or data fails to load, report that limitation rather than inventing results. Querying does not require changing favorites, exporting files, joining a group or contacting the maintainer.

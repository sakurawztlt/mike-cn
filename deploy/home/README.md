# Mike 中国法 · 家庭服务器部署

部署使用专用 Linux amd64 来宾和 Docker Compose 2.24.4 或更新版本。工作流随
`sakurawztlt/mike-cn` 的发布提交版本化，部署时同步和当前镜像匹配的目录。

首次启动前在来宾的 `/etc/mike-cn/runtime.env` 配置私有数据库密码、JWT 签名
密钥及对应 Supabase anon/service_role JWT、对象存储凭据和下载、密钥加密所需
的两个独立签名密钥。用随机十六进制值生成这些秘密。设置
`NODE_ENV=production`、公开的 HTTPS `FRONTEND_URL`、
`API_PUBLIC_URL=<FRONTEND_URL>/api` 和
`R2_PUBLIC_ENDPOINT_URL=<FRONTEND_URL>`。前端入口代理必须保留 Host，并为
流式回复禁用响应缓冲。隧道只连接来宾的回环端口 18080，并通过
`X-Forwarded-Proto` 传递访问者使用的协议，使 HTTP 链接跳转到同域的 HTTPS。
签名对象请求由同域的 `/mike/` 路径转给内部对象存储。

模型由 `MIKE_MODEL_CONFIG_JSON` 声明，通过 `apiKeyEnv` 引用私有文件中的
令牌。参考 [配置格式](../../docs/configured-models.md)。禁止把部署环境文件、
模型令牌、管理员密码和案卷写入这个公开仓库。

应用 API 和 GoTrue 两侧均关闭自助注册，首次安装也不会开启面向访客的建号流程。
用仅容器内可访问的 Supabase 管理 API 创建第一个已确认的邮箱账户。容器
服务单元及 `update.sh` 由管理员安装。开启定时器后只拉取这个仓库的
`main`，为新提交构建镜像，检查鉴权配置后记录上线版本。构建失败时保留当前
服务。更新启动失败时尝试恢复上一个镜像版本，应用数据卷应独立备份。

## 中国法资料库

运行 `npm run prepare:cn-legal --prefix backend` 生成中国法只读 SQLite 库，
默认路径为 `~/.local/share/mike-cn/legal.sqlite`。也可以在 `--` 后指定输出路径，
以及已下载的快照归档文件。后端用 `MIKE_CN_LEGAL_DB` 读取自定义位置。容器部署时，
为后端提供库文件的只读挂载，并将该变量设为容器内的库文件路径。准备完成后重启后端，
让进程使用新的库文件。

导入器核对 [chinalaw 法规快照](https://law.newcombmath.com/about/data.html) 的
归档校验值，仅导入带国家法律法规数据库出处的法规版本和条文。输出库内保留快照日期、
来源、校验值、许可和 NOTICE。更新使用新的已核验公开快照。导入器同时从
[最高法指导性案例栏目](https://www.court.gov.cn/fabu/gengduo/151.html)读取发布目录，
保留标题、发布日期和官方链接，案例正文按需从官方发布页读取。发布目录内也有批次公告。
法规效力待核验的记录会保留状态。全量普通裁判文书检索可通过工作区连接器扩展。

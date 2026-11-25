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

初始中国法索引只覆盖少量劳动争议官方发布页。结果是检索线索。获得授权的裁判文书
接口应通过工作区连接器添加，正式引用前需核对裁判全文和适用时点。

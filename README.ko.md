<p align="center">
  <img src="rune-logo.png" width="180" />
</p>

<h1 align="center">Rune</h1>

<p align="center">
  <a href="README.md">English</a> | <a href="README.ko.md">한국어</a>
</p>

<p align="center">
  <strong>Claude Code를 위한 가장 간단한 에이전트 툴킷</strong><br/>
  SDK 없이. 보일러플레이트 없이. 파일 하나가 에이전트 하나.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/powered_by-Claude_Code-blueviolet" alt="Claude Code" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue" alt="platform" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license" />
</p>

---

## Rune을 왜 쓰나요?

Claude Code는 이미 서브에이전트, 훅, 스킬, 헤드리스 모드를 기본 제공합니다. Rune은 **거기에 없는 것**을 채웁니다:

- **파일 하나 = 에이전트 하나.** Claude Code에 `--resume` 이 있긴 하지만, 세션 스레드는 디렉토리별로 이름도 역할도 없이 계속 쌓여서 "지난주에 쓰던 그 리뷰어 대화"를 다시 찾아 들어가기가 쉽지 않아요. Rune은 **에이전트에 관한 모든 것을 `.rune` 파일 하나에** 담습니다 — 역할, 권한, 메모리, 전체 기록까지. 이름을 붙이고, git에 커밋하고, 공유하고, 다른 프로젝트로 옮기세요. 에이전트 10개 관리 = 파일 10개 관리.
- **자가 수정 루프.** `rune loop coder.rune reviewer.rune "..." --until "no critical issues"` — 중단 조건을 만족하거나 최대 반복 횟수에 도달할 때까지 실행자/리뷰어 사이클을 돌립니다. 스크립트 작성 불필요.
- **에이전트별 권한.** 리뷰어는 `fileWrite: false` + `allowPaths: ["src/**"]` 로 잠그고, 같은 프로젝트의 코더는 어디든 쓸 수 있게. 가드레일이 세션이 아니라 파일을 따라다닙니다.
- **한 줄 트리거.** `rune watch agent.rune --on cron --interval 5m` — 훅 설정 없이 스케줄, 파일 변경, 깃 커밋 트리거를 바로 걸 수 있어요.

한 세션 안에서 일회성으로 쓸 전문화된 에이전트가 필요한 거라면 Claude Code의 기본 서브에이전트로 충분합니다. 같은 에이전트가 **내일도 돌아와야 하거나, 스케줄로 돌거나, 팀원에게 넘겨줘야 할 때** Rune을 꺼내 쓰세요.

---

## Rune의 작동 방식

Rune은 Claude API를 호출하거나, 인증 정보를 다루거나, Claude Code 내부를 래핑하지 않습니다. 모든 에이전트 호출은 공식 `claude` CLI에 대한 단순한 서브프로세스 호출입니다:

```
rune run reviewer.rune "..."
      │
      ▼
spawn('claude', ['-p', '--print',
                 '--mcp-config', '{"mcpServers":{}}',
                 '--strict-mcp-config',
                 '--system-prompt', <역할 + 메모리 + 최근 대화>,
                 '--', <사용자 프롬프트>])
      │
      ▼
Claude Code CLI (이미 로그인된 세션)
```

핵심 요약:
- **API 키 없음, OAuth 가로채기 없음.** Rune은 이미 인증된 `claude` CLI를 그대로 사용합니다.
- **MCP 격리.** `--mcp-config '{"mcpServers":{}}' --strict-mcp-config` 를 넘겨서 프로젝트의 `.mcp.json`이 에이전트 실행 중 자동 로드되지 않도록 합니다. 작업 폴더의 파일은 건드리지 않습니다.
- **상태는 `.rune` 파일에.** 역할, 메모리, 대화 히스토리는 디스크에 있는 평범한 JSON입니다. Rune은 매 실행마다 이를 시스템 프롬프트에 주입합니다 — 이것이 서버 없이 영구 저장이 가능한 이유입니다.
- **사용량:** Claude Code CLI 세션을 통해 실행되므로 일반 Claude Code 구독에서 차감됩니다.

---

## 사전 준비

- **Node.js** 18+
- **Claude Code CLI** 설치 및 로그인 — Rune은 모든 에이전트 실행에 Claude Code를 사용합니다

```bash
npm install -g @anthropic-ai/claude-code
claude                                       # 로그인이 안 되어 있다면 실행
```

## 설치

```bash
npm install -g openrune
```

---

## 30초 빠른 시작

```bash
rune new reviewer --role "Code reviewer, security focused"
rune run reviewer.rune "Review the latest commit"
```

이게 끝입니다. 에이전트를 만들었습니다.

---

## Agent Teams와 뭐가 다른가요?

Claude Code의 Agent Teams는 런타임에 팀원을 생성합니다 — 강력하지만, 세션이 끝나면 사라집니다.

Rune은 다른 접근을 합니다: **에이전트가 파일입니다.**

| | Agent Teams | Rune |
|---|---|---|
| **영구 저장** | 세션 한정 — 완료되면 에이전트 소멸 | `.rune` 파일로 히스토리와 메모리가 영구 보존 |
| **이동성** | 하나의 Claude Code 세션에 종속 | `.rune` 파일을 어디서든 공유, 버전 관리, 재사용 |
| **스케줄링** | 수동 실행만 가능 | Cron, 파일 변경, git-commit 트리거 |
| **권한** | 세션에서 상속 | 에이전트별 제어 (`fileWrite`, `bash`, `allowPaths`) |
| **실행** | 대화형 | 헤드리스, 파이프라인, CI/CD 지원 |
| **자기 수정** | 기본 제공 없음 | `rune loop` — 자동 리뷰-수정 반복 |

Rune 에이전트는 세션, 머신, 팀을 넘어 살아남습니다. 한 번 만들면 영원히 실행.

---

## 핵심 개념

### 파일 하나 = 에이전트 하나

```bash
rune new architect --role "Software architect"
rune new coder --role "Backend developer"
rune new reviewer --role "Code reviewer"
```

각 `.rune` 파일은 JSON입니다 — 이동 가능하고, 공유 가능하고, 버전 관리 가능:

```json
{
  "name": "reviewer",
  "role": "Code reviewer, security focused",
  "permissions": {
    "fileWrite": false,
    "bash": false,
    "allowPaths": ["src/**"],
    "denyPaths": [".env", "secrets/**"]
  },
  "history": [],
  "memory": []
}
```

### 권한

각 에이전트가 할 수 있는 것을 제어합니다. 권한 미설정 = 전체 접근 (하위 호환):

```json
{
  "permissions": {
    "fileWrite": false,
    "bash": false,
    "network": false,
    "allowPaths": ["src/**", "tests/**"],
    "denyPaths": [".env", "secrets/**", "node_modules/**"]
  }
}
```

- `fileWrite: false` — 에이전트가 파일을 읽을 수만 있고 쓰기/편집 불가
- `bash: false` — 에이전트가 셸 명령어 실행 불가
- `network: false` — 에이전트가 웹 요청 불가
- `allowPaths` / `denyPaths` — 특정 패턴으로 파일 접근 제한

`src/`만 읽을 수 있는 리뷰어: 안전. 어디든 쓸 수 있는 코더: 강력. 에이전트별로 결정하세요.

### 구조화된 로깅

에이전트가 무엇을 했는지, 얼마나 걸렸는지, 비용은 얼마인지 추적:

```bash
rune run reviewer.rune "Review this project" --auto --log review.json
```

```json
{
  "agent": "reviewer",
  "prompt": "Review this project",
  "duration_ms": 12340,
  "cost_usd": 0.045,
  "tool_calls": [
    { "tool": "Read", "input": { "file_path": "src/index.ts" } },
    { "tool": "Grep", "input": { "pattern": "TODO" } }
  ],
  "result": "Found 3 issues..."
}
```

### 자기 복제 에이전트

에이전트가 스스로 다른 에이전트를 만들고 조율할 수 있습니다:

```bash
rune new manager --role "Project manager. Create agents with rune new and coordinate them with rune pipe."
rune run manager.rune "Create a summarizer and a translator agent, then pipe them to summarize and translate this news article into Korean." --auto
```

매니저가 하는 일:
1. `rune new summarizer --role "..."` 실행
2. `rune new translator --role "..."` 실행
3. `rune pipe summarizer.rune translator.rune "..."` 실행
4. 실패하면 스스로 디버깅하고 수정

에이전트가 에이전트를 만듭니다. 사람 개입 없이.

### 헤드리스 실행

터미널에서 에이전트를 실행합니다. GUI 필요 없음:

```bash
rune run reviewer.rune "Review the latest commit"

# 다른 명령어에서 입력을 파이프
git diff | rune run reviewer.rune "Review this diff"

# 스크립팅을 위한 JSON 출력
rune run reviewer.rune "Check for security issues" --output json
```

### 자율 모드

`--auto`를 사용하면 에이전트가 파일을 쓰고, 명령어를 실행하고, 오류를 스스로 수정합니다:

```bash
rune run coder.rune "Create an Express server with a /health endpoint. Run npm init and npm install." --auto
```

```
🔮 [auto] coder is working on: Create an Express server...

  ▶ Write: /path/to/server.js
  ▶ Bash: npm init -y
  ▶ Bash: npm install express
  💬 Server created and dependencies installed.

✓ coder finished
```

### 에이전트 파이프라인

에이전트를 체이닝합니다. 각 에이전트의 출력이 다음 에이전트의 입력이 됩니다:

```bash
rune pipe architect.rune coder.rune "Build a REST API with Express"
```

`--auto`를 사용하면 마지막 에이전트가 계획을 실행합니다:

```bash
rune pipe architect.rune coder.rune "Build a REST API with Express" --auto
```

architect가 설계 → coder가 구현 (파일 작성, 의존성 설치).

### 자기 수정 루프

에이전트가 자동으로 자신의 작업을 리뷰하고 수정합니다:

```bash
rune loop coder.rune reviewer.rune "Build a REST API with Express" --until "no critical issues" --max-iterations 3 --auto
```

```
🔁 Starting self-correction loop (max 3 iterations)
   Stop condition: "no critical issues"

  ━━━ Iteration 1/3 ━━━

  ▶ [doer] coder — API 구현
  ✓ coder done

  ▶ [reviewer] reviewer — 치명적 이슈 2개 발견
  ✓ reviewer done

  ━━━ Iteration 2/3 ━━━

  ▶ [doer] coder — 이슈 수정
  ✓ coder done

  ▶ [reviewer] reviewer — "no critical issues found"
  ✓ reviewer done

  ✅ Condition met: "no critical issues"

🔁 Loop completed after 2 iterations
```

구현자가 구현하고, 리뷰어가 리뷰합니다. 문제가 발견되면 피드백이 자동으로 구현자에게 전달됩니다 — 조건이 충족되거나 최대 반복 횟수에 도달할 때까지.

### 자동화 트리거

```bash
# 매 git commit마다
rune watch reviewer.rune --on git-commit --prompt "Review this commit"

# 파일 변경 시
rune watch linter.rune --on file-change --glob "src/**/*.ts" --prompt "Check for issues"

# 스케줄에 따라
rune watch monitor.rune --on cron --interval 5m --prompt "Check server health"
```

### Node.js API

자신의 코드에서 에이전트를 사용하세요. 각 `.send()` 호출은 Claude Code 프로세스를 생성하므로, 머신에 Claude Code CLI가 설치되고 로그인되어 있어야 합니다.

```js
const rune = require('openrune')

const reviewer = rune.load('reviewer.rune')
const result = await reviewer.send('Review the latest commit')

// 파이프라인
const { finalOutput } = await rune.pipe(
  ['architect.rune', 'coder.rune'],
  'Build a REST API'
)
```

---

---

## CLI 레퍼런스

| 명령어 | 설명 |
|---------|------|
| `rune new <name> [--role "..."]` | 에이전트 생성 |
| `rune run <file> "prompt" [--auto] [--output json]` | 헤드리스 실행 |
| `rune pipe <a> <b> [...] "prompt" [--auto]` | 에이전트 체이닝 |
| `rune loop <doer> <reviewer> "prompt" [--until "..."] [--max-iterations N] [--auto]` | 자기 수정 루프 |
| `rune watch <file> --on <event> --prompt "..."` | 자동화 트리거 |
| `rune list` | 현재 디렉토리의 에이전트 목록 |

**Watch 이벤트:** `git-commit`, `git-push`, `file-change` (`--glob` 사용), `cron` (`--interval` 사용)

---

## 플랫폼 지원

| 플랫폼 | 상태 |
|--------|------|
| macOS | 지원 |
| Windows | 지원 |
| Linux | 지원 |

---

## 라이선스

MIT

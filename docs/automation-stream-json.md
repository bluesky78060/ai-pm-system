# Stream JSON 자동화 가이드

Claude Code의 비대화형 호출(`claude -p`) + JSON 출력 형식을 활용한 CI 통합·자동화 패턴.

## 1. 기본 개념

`claude -p "프롬프트"`는 단일 메시지를 전송하고 결과를 받는 비대화형 모드. `--output-format` 옵션으로 구조화된 출력 가능.

| 옵션 | 출력 | 용도 |
|------|------|------|
| (없음) | 자유 텍스트 | 사람이 읽음 |
| `--output-format text` | 텍스트 | 동일 |
| `--output-format json` | 단일 JSON | jq로 파싱 가능 |
| `--output-format stream-json` | NDJSON 스트림 | 실시간 진행 상황 |

### JSON 출력 구조 (단순 예시)

```bash
echo '{"input":"hello"}' | claude -p "Echo this" --output-format json
```

```json
{
  "type": "result",
  "result": "응답 본문",
  "session_id": "abc-123",
  "duration_ms": 1234,
  "usage": { "input_tokens": 100, "output_tokens": 50 }
}
```

## 2. 활용 시나리오

### 시나리오 A — 빌드 실패 자동 분석

빌드 실패 시 에러 로그를 Claude에 보내 원인 추정 + 수정 제안 받기.

```bash
# package.json scripts에 추가
# "build:explain": "pnpm build || pnpm -s explain-build-error"

pnpm --filter @ai-pm/mcp-server build 2>&1 | tee /tmp/build.log
# 파이프 직후라 $?는 tee 종료코드. PIPESTATUS[0]로 build 자체 결과 확인
if [ ${PIPESTATUS[0]} -ne 0 ]; then
  cat /tmp/build.log | claude -p "이 TypeScript 빌드 에러의 원인과 수정 방법을 3줄로 요약" \
    --output-format json | jq -r '.result'
fi
```

### 시나리오 B — PR diff 자동 코드 리뷰

```bash
# git diff origin/master | claude로 보안 관점 리뷰
DIFF=$(git diff origin/master)
echo "$DIFF" | claude -p "다음 diff를 보안/성능 관점에서 5줄로 리뷰" \
  --output-format json | jq -r '.result' > /tmp/auto-review.md

# 또는 PR 본문에 자동 첨부
gh pr comment --body-file /tmp/auto-review.md
```

### 시나리오 C — Pre-commit hook (간단 lint 보강)

```bash
# .git/hooks/pre-commit (또는 husky)
#!/bin/bash
STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep -E "\.ts$")
if [ -n "$STAGED" ]; then
  for file in $STAGED; do
    cat "$file" | claude -p "이 TypeScript 파일에서 명백한 보안 버그·null 안전성 위반만 찾아라. 없으면 'OK' 한 단어로 응답" \
      --output-format json | jq -r '.result' | grep -v "^OK$" && exit 1
  done
fi
exit 0
```

⚠️ 비용 주의: 매 commit마다 API 호출 발생 → 큰 파일·잦은 commit 시 비용 누적.

### 시나리오 D — 테스트 실패 자동 진단

```bash
pnpm --filter @ai-pm/mcp-server test 2>&1 | tee /tmp/test.log
EC=${PIPESTATUS[0]}  # 파이프 직후 — test 자체 종료코드
if [ $EC -ne 0 ]; then
  cat /tmp/test.log | claude -p "vitest 실패 로그에서 실패 원인과 수정 후보를 항목별로" \
    --output-format json | jq -r '.result'
fi
```

### 시나리오 E — 스트리밍 진행 상황 모니터링

긴 작업의 경우 stream-json으로 실시간 토큰·툴 사용 모니터링:

```bash
claude -p "이 코드베이스를 분석해서 100자 요약" \
  --output-format stream-json \
  --verbose \
  --include-partial-messages | \
while IFS= read -r line; do
  TYPE=$(echo "$line" | jq -r '.type // empty')
  case "$TYPE" in
    "assistant") echo "[작성 중]" ;;
    "tool_use") TOOL=$(echo "$line" | jq -r '.name'); echo "[도구: $TOOL]" ;;
    "result") echo "[완료]"; echo "$line" | jq -r '.result' ;;
  esac
done
```

## 3. 우리 프로젝트 통합 패턴

### 3-1. ai-pm MCP 도구로 래핑 (향후 확장)

```typescript
// packages/mcp-server/src/services/auto-review-service.ts (가상)
export class AutoReviewService {
  async reviewDiff(diff: string): Promise<AutoReviewResult> {
    // child_process로 claude -p 호출
    const { stdout } = await execFile('claude', [
      '-p', `다음 diff 리뷰: ${diff}`,
      '--output-format', 'json',
    ]);
    const result = JSON.parse(stdout);
    return { success: true, summary: result.result, tokens: result.usage };
  }
}
```

⚠️ MCP 도구로 만들기 전에 비용·보안 사전 검토 필수 (외부 통합 = 2중 검증).

### 3-2. submit_test 자동 보조

빌드 실패 시 Claude가 분석한 결과를 `test_results.output`에 자동 첨부:

```bash
# 메인 오케스트레이터가 submit_test 호출 전
OUTPUT=$(pnpm --filter @ai-pm/mcp-server build 2>&1)
EC=$?
if [ $EC -ne 0 ]; then
  ANALYSIS=$(echo "$OUTPUT" | claude -p "빌드 실패 원인 1줄" --output-format json | jq -r '.result')
  # submit_test에 OUTPUT + ANALYSIS 함께 첨부
fi
```

### 3-3. 코드 리뷰 단계 보조 (옵션)

옵션 2 정책의 2중 검증 단계에서 `security-reviewer` 대신 또는 추가로 비대화형 claude 호출 가능. 단, fresh subagent 원칙(컨텍스트 격리)이 깨지지 않도록 주의.

## 4. 비용 안내

### 토큰 단가 (2026-05 기준 추정)

| 모델 | Input | Output |
|------|-------|--------|
| Opus 4.7 | $$$ | $$$$ |
| Sonnet 4.6 | $$ | $$$ |
| Haiku 4.5 | $ | $$ |

자동화 시 권장: 분석/요약 → **Haiku** 또는 **Sonnet**. 복잡한 설계 판단만 Opus.

### `--model` 명시 권장

```bash
# 단순 분석 → Haiku (저비용)
claude -p "..." --model claude-haiku-4-5-20251001 --output-format json

# 표준 → Sonnet
claude -p "..." --model claude-sonnet-4-6 --output-format json

# 복잡한 분석 → Opus
claude -p "..." --model claude-opus-4-7 --output-format json
```

### 비용 추적

JSON 출력의 `usage` 필드로 토큰 측정 가능:

```bash
RESULT=$(claude -p "..." --output-format json)
TOKENS_IN=$(echo "$RESULT" | jq -r '.usage.input_tokens')
TOKENS_OUT=$(echo "$RESULT" | jq -r '.usage.output_tokens')
echo "Input: $TOKENS_IN, Output: $TOKENS_OUT"
```

CI 환경에서는 일일 한도 설정 권장 (예: 토큰 사용량 초과 시 hook 비활성).

## 5. 보안 주의사항

### 5-1. 민감 정보 차단

`.claudeignore`가 적용되지 않을 수 있음 (`-p` 모드는 stdin/CLI 인자 사용). 직접 sanitize 필요:

```bash
# .env 파일은 절대 파이프하지 말 것
cat src/config.ts | grep -v "API_KEY\|SECRET" | \
  claude -p "리뷰" --output-format json
```

### 5-2. CI 환경 인증

CI에서 사용하려면 OAuth 토큰 또는 API 키 환경변수 설정 필요:

```bash
export ANTHROPIC_API_KEY=...  # CI secret
claude -p "..." --output-format json
```

⚠️ 단, API 키 방식은 일부 기능(Remote-Control 등) 미지원 가능.

### 5-3. 프롬프트 인젝션 방어

사용자 입력을 그대로 claude에 전달 시 프롬프트 인젝션 위험. `_security-base.ts`의 패턴 활용:

```typescript
import { buildPromptInjectionMarkers, sanitizeUserInput } from './_security-base.js';

const { startMarker, endMarker } = buildPromptInjectionMarkers();
const safeInput = sanitizeUserInput(userInput);
const prompt = `${startMarker}\n${safeInput}\n${endMarker}\n\n위 텍스트를 분석`;
```

## 6. 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| `claude: command not found` | PATH 미설정 | `npm install -g @anthropic-ai/claude-code` |
| `jq: command not found` | jq 미설치 | `brew install jq` |
| `Authentication failed` | OAuth 만료 / API 키 누락 | `claude login` 또는 `ANTHROPIC_API_KEY` 설정 |
| 빈 result | 프롬프트 너무 짧음 | 더 명확한 지시 |
| 비용 폭주 | model 미명시 → Opus 기본 사용 가능 | `--model claude-haiku-4-5-20251001` 명시 |
| 응답 일관성 | 비결정성 | seed 고정 옵션 미지원, 출력 검증 로직 추가 |

## 7. 실전 적용 우선순위

| 시나리오 | 가치 | 비용 | 권장도 |
|---------|------|------|-------|
| 빌드 실패 자동 분석 (시나리오 A) | 디버깅 시간 단축 | 호출당 ~$0.001 (Haiku) | ⭐⭐⭐ |
| PR diff 자동 리뷰 (시나리오 B) | 1차 리뷰 보조 | 호출당 ~$0.01 (Sonnet) | ⭐⭐ |
| Pre-commit lint (시나리오 C) | 사소한 버그 차단 | 매 commit ~$0.005 | ⭐ (선택) |
| 테스트 실패 진단 (시나리오 D) | 디버깅 보조 | 호출당 ~$0.005 | ⭐⭐⭐ |
| 스트리밍 모니터링 (시나리오 E) | 긴 작업 가시화 | 작업 비용에 통합 | ⭐⭐ |

## 8. 참조

- Claude Code CLI 옵션: `claude --help`
- JSON jq 문법: https://jqlang.github.io/jq/
- 우리 프로젝트 보안 패턴: `packages/mcp-server/src/services/_security-base.ts`
- 비용 가드 정책: `.claude/rules/code-review.md` (3중 검증 분류)

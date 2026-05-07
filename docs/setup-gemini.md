# Gemini 리서치 셋업

`research_with_gemini` MCP 도구를 사용하기 위한 환경 설정 안내.

## 1. API 키 발급

[Google AI Studio](https://aistudio.google.com/apikey)에서 API 키 발급.

- 무료 티어 제공 (gemini-2.5-flash 기준 일일 무료 호출 한도 있음)
- 결제 등록 시 한도 상향 + 안정적 사용

## 2. 환경변수 설정

### macOS / Linux (zsh)

`~/.zshrc`에 추가:

```bash
export GEMINI_API_KEY="AIza..."
```

적용: `source ~/.zshrc` 또는 새 터미널 세션 시작.

### 프로젝트 로컬 (.env)

`.env.example`을 복사하여 `.env` 생성 후 값 채우기:

```bash
cp .env.example .env
# 편집기로 GEMINI_API_KEY=<발급받은 키> 입력
```

## 3. 사용 예시

워크플로우 3단계(Discovery) 후, 4단계(플랜 작성) 전 호출:

```typescript
mcp__ai-pm__research_with_gemini({
  task_id: "APS-1-1",
  topic: "Node.js 환경변수 안전 관리 모범 사례",
  purpose: "best_practice",  // library_compare | security_audit | best_practice | debugging
  context: "TypeScript 모노레포 프로젝트",
  confirmed: true             // 사용자 승인 후 true
})
```

결과는 `docs/06-research/{task_id}-research-{timestamp}.md`로 저장됩니다.

## 4. 비용 안내

- 모델: `gemini-2.5-flash` (기본)
- 1회 호출 추정 비용: 약 $0.05 (8192 출력 토큰 기준, 2026-05 시점)
- **CRITICAL**: 도구 호출 전 사용자 승인 필수 (`confirmed: true` 필드)

## 5. 보안

- API 키는 환경변수로만 관리 (코드·로그·결과 파일에 노출 금지)
- 도구 내부에서 에러 메시지의 API 키 자동 마스킹
- 사용자 입력(`topic`, `context`)은 prompt 인젝션 방어 후 전달

## 6. 트러블슈팅

| 에러 코드 | 원인 | 해결 |
|----------|------|------|
| `NOT_CONFIRMED` | `confirmed: true` 누락 | 호출 시 `confirmed: true` 명시 |
| `MISSING_API_KEY` | 환경변수 미설정 | 위 2번 단계 수행 |
| `INVALID_API_KEY` | 만료/오설정 | API 키 재발급 |
| `RATE_LIMIT` | 호출 빈도 초과 | 잠시 후 재시도 |
| `QUOTA_EXCEEDED` | 일일/월 한도 초과 | 결제 등록 또는 다음 날 |
| `NETWORK_ERROR` | 네트워크 / 방화벽 / 프록시 | 네트워크 환경 확인 |

## 참고

- [Gemini API 문서](https://ai.google.dev/gemini-api/docs/quickstart)
- [@google/genai SDK](https://www.npmjs.com/package/@google/genai)

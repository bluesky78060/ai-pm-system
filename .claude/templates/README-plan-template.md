# plan-template.html 사용 가이드

`.claude/templates/plan-template.html` 의 사용 가이드. HTML 중첩 주석 파싱 버그를 회피하기 위해 가이드를 별도 마크다운 파일로 분리.

## 사용법

1. `plan-template.html` 을 `docs/01-plan/{TICKET}-{slug}-plan.html` 로 복사
2. `<meta>`, `<title>`, `<header>` 의 자리표시자 (예: `{{TICKET}}`, `{{TITLE}}`)를 실제 값으로 교체
3. 각 section 내 placeholder HTML 주석을 실제 내용으로 교체
   - **주의**: HTML 주석 안에 `<!--` 또는 `-->` 문자열을 텍스트로 넣지 말 것 (브라우저가 주석을 조기 종료함). 필요 시 `&lt;!--` `--&gt;` 로 이스케이프
4. CSS는 그대로 유지 (다음 라운드에서 공유 CSS 분리 검토)

## 보안 정책 (rules/discovery-and-plan.md 4단계)

- `<script>` 태그, `on*` 이벤트 핸들러, `javascript:` URL 절대 금지
- 외부 CDN/이미지 금지 (inline CSS · SVG · system font만)
- 한 줄당 1 요소 원칙 (git diff 가독성)
- 다음 태그 금지 (security-reviewer 권장): `<form>`, `<iframe>`, `<embed>`, `<object>`, `<base>`, `<meta http-equiv="refresh">`, `<svg>` 내 `<foreignObject>`

## 자리표시자 목록

| 토큰 | 의미 | 예시 |
|------|------|------|
| `{{TICKET}}` | 티켓 코드 | `APS-2-6` |
| `{{TITLE}}` | 티켓 제목 | `플랜/문서 HTML-first 전환 파일럿` |
| `{{N}}` | 티켓 우선순위 숫자 | `3` |
| `{{1중/2중/3중 검증}}` | 분류 | `1중 검증` |
| `{{한 줄 부제}}` | 작업 배경/근거 | 짧은 1줄 |
| `{{상태/특이사항}}` | 상태 배지 | `파일럿`, `진행 중` |
| `{{ai / human / username}}` | 담당자 | `ai` |
| `{{단계명}}` | Phase 이름 | `Discovery + Plan` |
| `{{YYYY-MM-DD}}` | 작성일 | `2026-05-18` |
| `{{담당자}}` | 작성자 | `메인 오케스트레이터 (Claude)` |

## 근거

- Thariq Shihipar (Anthropic Claude Code 팀) "Using Claude Code: The Unreasonable Effectiveness of HTML" (2026-05-08)
- Karpathy 트윗 1980397031542989305 endorsement (text → MD → HTML → diffusion video 진화 경로)
- 본 프로젝트 파일럿 검증: `docs/01-plan/APS-2-6-html-first-pilot-plan.html`

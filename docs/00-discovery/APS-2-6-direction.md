# APS-2-6: 플랜/문서 HTML-first 전환 파일럿 — 방향 확정 문서

- **티켓**: APS-2-6
- **분류**: 1중 검증 (정책 변경 + 신규 템플릿 + 파일럿 문서 1건. 코드 변경 0, 보안/DB/결제 비해당)
- **작성 방식**: 메인 직접 (단축 정책 — 1중 분류 정책 변경)
- **근거**: Thariq Shihipar (Anthropic Claude Code 팀) "Using Claude Code: The Unreasonable Effectiveness of HTML" (2026-05-08) + Karpathy 트윗 1980397031542989305 endorsement

## 1. 목표 (Why)

Anthropic Claude Code 팀이 plans/code reviews/design systems/reports 기본 출력 형식을 HTML로 전환 중. 핵심 근거: 정보 밀도·가독성·상호작용성·공유 비용 모두에서 MD 대비 우수. Karpathy도 진화 경로(text → MD → **HTML** → diffusion video) 인정. 본 프로젝트의 `docs/01-plan/`은 전부 MD라 (a) VS Code preview 필수 (b) GitHub 외부에서 렌더 미보장 (c) 표·상태 배지·진행률 등 시각 요소 표현 불가. 본 티켓은 단일 파일럿 1건으로 HTML-first가 실제 워크플로우(hook, critic, 사용자 검토)와 호환되는지 검증.

**성공 기준**: 본 티켓 플랜을 HTML로 작성하여 (a) 브라우저 더블클릭으로 즉시 렌더 (b) 기존 hook 통과 (c) critic 리뷰 PASS (d) 사용자 가독성 개선 체감.

**측정 지표**: 파일 크기(KB), 정보 밀도(테이블 수 + 시각 요소 수), 렌더 방법(브라우저/CLI), critic 리뷰 코멘트 정성 비교.

## 2. 사용자 (Who)

- **주 사용자**: 메인 오케스트레이터 운영자(본인) — 플랜 검토 시 브라우저로 즉시 확인
- **부 사용자**: critic 에이전트 (HTML 입력 처리), code-reviewer 에이전트 (참조)
- **시나리오**: 플랜 작성 → `open docs/01-plan/APS-2-6-*.html` → critic 위임 → 승인 → 구현
- **페인 포인트 (현재)**: MD 플랜은 VS Code 켜야 보임 / iPhone/iPad 등 외부 디바이스에서 가독성 떨어짐 / 정보 밀도 한계 (표 중첩·진행률·상태 배지 불가)

## 3. 범위 (What)

### 포함

| # | 산출물 | 비고 |
|---|--------|------|
| 1 | `.claude/templates/plan-template.html` | 신규 플랜 HTML 표준 양식 (Thariq 스타일 차용) |
| 2 | `docs/01-plan/APS-2-6-html-first-pilot-plan.html` | 본 티켓 플랜 자체 (파일럿 1건) |
| 3 | `.claude/rules/discovery-and-plan.md` 갱신 | 4단계 플랜 작성에 "HTML 옵션" 명시 (MD/HTML 선택 가능 표기) |
| 4 | `docs/03-code-review/APS-2-6-review.md` | 파일럿 평가 (정량 + 정성) |

### 제외 (다음 라운드)

- 기존 MD 플랜 일괄 마이그레이션 — 위험 대비 가치 미검증
- `docs/00-discovery/` HTML화 — 본 라운드 파일럿 결과 확인 후 결정
- `docs/02-review/` HTML화 — critic 출력 형식 영향 검증 필요
- `docs/03-code-review/` HTML화 — 동일
- Hook 스크립트 패치 — **확인 결과 불필요** (`discovery-guard.sh`/`plan-review-guard.sh`는 `grep -q "$TICKET"`로 확장자 무관 매칭)

### MVP 경계

본 티켓 플랜 1개 + 템플릿 1개. critic 통과 + 사용자 가독성 OK면 다음 라운드 확장 권한 획득. 실패 시 MD 복귀 (롤백 비용 0 — 신규 파일만 추가).

## 4. 제약 (Constraints)

- **보안**: HTML 작성 시 inline JS 금지, 외부 CDN 금지, `<script>` 태그 금지. inline CSS만 사용 (Thariq 권장과 동일).
- **호환성**: 기존 hook이 확장자 무관하게 ticket-id 매칭 → 변경 불필요. 다른 MD 플랜과 공존.
- **렌더 환경**: 모던 브라우저 단독 렌더 (외부 의존 0). `open` 명령 더블클릭으로 동작.
- **빌드 영향**: 0 — `pnpm -r build`는 `packages/*/src`만 빌드. `docs/`는 빌드 대상 아님.
- **세션 내 완료**: 단일 세션 (< 30분 예상).

## 5. 우선순위 (Priority)

- **P0**: 본 티켓 플랜 HTML 작성 (없으면 파일럿 자체 불가)
- **P1**: 플랜 템플릿 HTML 신설
- **P2**: rules 문서 갱신 (HTML 옵션 명시)
- **P3**: 평가 노트 (코드 리뷰 산출물로 통합)

## 6. 리스크 (Risk)

| 리스크 | 확률 | 영향 | 대응 |
|--------|------|------|------|
| critic 에이전트가 HTML 입력 처리 시 품질 저하 | 저 | 중 | semantic HTML + 본문은 자연어. critic이 못 읽으면 즉시 MD 회귀. |
| 추후 git diff 가독성 저하 (HTML 줄바꿈 적음) | 중 | 저 | 한 줄당 1 요소 원칙. 긴 단락은 `<p>`로 분리. |
| 다른 에이전트(planner/executor)가 기존 MD 가정 | 중 | 저 | rules에 "MD 또는 HTML 선택 가능" 명시. 본 파일럿은 HTML, 다른 티켓은 MD 유지. |
| Hook이 .html 차단 | **확인됨: 차단 안 함** | - | `grep -q "$TICKET"` 확장자 무관. 검증 완료. |
| 보안: HTML 내 악의적 콘텐츠 삽입 | 저 | 중 | inline JS/외부 CDN 금지 정책. 정적 콘텐츠만. |
| 정책 분기 (MD vs HTML) 혼란 | 중 | 저 | rules에 "기본 MD, 선택 HTML" 명시. fast-track처럼 명시적 선택. |

## 7. 검증 (Verify)

### DoD

- [ ] `docs/01-plan/APS-2-6-html-first-pilot-plan.html` 파일 존재 + 브라우저 렌더 정상
- [ ] `.claude/templates/plan-template.html` 신설 (재사용 가능 골격)
- [ ] `.claude/rules/discovery-and-plan.md` 4단계에 HTML 옵션 명시
- [ ] `docs/02-review/APS-2-6-plan-review.md` critic + 메인 자체 검토 통과
- [ ] `docs/03-code-review/APS-2-6-review.md` code-reviewer PASS
- [ ] `pnpm -r build` PASS (코드 변경 없으니 회귀 없음 — 회귀 부재 증명용)
- [ ] hook 정상 동작: discovery-guard / plan-review-guard 통과 (실제 start_work 호출로 검증)

### 테스트 방식

1. **수동 렌더 테스트**: `open docs/01-plan/APS-2-6-*.html` → Safari/Chrome 렌더 정상
2. **Hook 통과 테스트**: `smart_workflow start_work` 호출 시 plan-review-guard 통과
3. **빌드 회귀 테스트**: `pnpm -r build` 정상 (예상: 변경 0이므로 PASS)
4. **critic 리뷰**: HTML 입력에 대한 critic 응답 품질 평가

### 분류 결정

- **1중 검증** (정책/문서 변경, 보안/DB/결제 비해당, 단일 파일럿)
- code-reviewer 1회로 충분. Codex challenge 생략.

## 미해결 이슈 (사용자 결정 필요)

없음 — 모든 결정 메인 오케스트레이터가 위 정책 근거(Thariq 원문 + Karpathy + 기존 hook 분석)에 따라 확정.

## 사용자 검토 체크리스트

- [x] 7개 카테고리 모두 답변
- [x] 미해결 이슈 없음 확인
- [x] 분류 1중 검증 (정당)
- [x] DoD 검증 가능
- [x] 사용자 "HTML-first 파일럿 진행해줘" 명시적 승인 (직전 메시지)

**→ 방향 확정 완료**

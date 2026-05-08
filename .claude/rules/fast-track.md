# Fast-track 정책 — 단순 변경 빠른 사이클

작업 중요도에 따라 Discovery/플랜/플랜 리뷰 단계를 생략하고 바로 구현·코드 리뷰로 진입할 수 있는 fast-track 모드.

## 적용 가능 케이스 (1중 분류만)

### ✅ Fast-track 적합
- UI 스타일·문구·아이콘 수정 (단일 컴포넌트)
- 단일 함수 내 단순 버그 수정
- 오타·문서·주석 수정
- 정책 문서 미세 조정 (rules 1~3줄 변경)
- README·CHANGELOG 갱신
- import 정리·리팩터링(동작 보존)
- `.gitkeep` 등 빈 마커 파일

### ❌ Fast-track 차단 (정식 워크플로우 필수)
- 인증/세션/암호화 영역 변경
- DB 마이그레이션 (스키마·인덱스·백필)
- 결제/금전 시스템 변경
- 권한 시스템 변경 (RBAC, ACL, authorization)
- 외부 API 신규 통합 (2중 검증 분류)
- 새 서비스 클래스 추가 (2중 검증)
- 풀스택 변경 (DB + API + UI)

## 활성화 절차

### Step 1: 티켓 발행
```
mcp__ai-pm__create_task(epic_id="...", title="...", priority=4)
```
- priority 4(낮음) 권장 (1중 분류 명시)

### Step 2: Active-ticket 갱신 + Fast-track 마커 생성
```bash
echo "APS-X-Y" > .claude/active-ticket
echo "APS-X-Y" > .claude/active-ticket-fasttrack
```

마커 파일 내용은 active-ticket과 정확히 일치해야 함 (보안 가드).

### Step 3: 즉시 start_work
```
mcp__ai-pm__smart_workflow(task_id="APS-X-Y", action="start_work")
```
plan-review-guard hook이 fast-track 마커 감지 → 산출물 검증 생략.

### Step 4: 구현 → 빌드/테스트 → 1중 코드 리뷰 → approve_review

`.claude/rules/code-review.md`의 1중 검증 절차 그대로 따름.

### Step 5: 마커 정리 (자동/수동)
- 다음 티켓 발행 시 active-ticket 갱신과 함께 갱신
- 수동: `rm .claude/active-ticket-fasttrack`

## 비활성화 (마커 제거)

```bash
rm .claude/active-ticket-fasttrack
```

또는 다음 티켓이 정식 워크플로우 분류면 마커 갱신하지 않음 (단축 사이클 자체에 통합).

## 산출물 (fast-track 시)

생략:
- ❌ `docs/00-discovery/{ticket}-direction.md`
- ❌ `docs/01-plan/{ticket}-*-plan.md`
- ❌ `docs/02-review/{ticket}-plan-review.md`

필수 (1중 검증):
- ✅ `docs/03-code-review/{ticket}-review.md` (1차 code-reviewer 결과)

## 책임 경계

- **메인 오케스트레이터**: 분류 결정 + 마커 생성 + 사용자에게 fast-track 적용 알림
- **사용자**: 명시적 fast-track 요청 가능 ("이건 단순 수정이야 빠르게 진행해줘")
- **Hook**: 산출물 검증 우회만, 코드 리뷰 검증은 그대로 (codex-review-guard 등 별도 hook 작동)

## 단축 효과

| 단계 | 정식 | Fast-track |
|------|------|----------|
| Discovery | ~5분 | 0분 ✅ |
| 플랜 작성 | ~3분 | 0분 ✅ |
| 플랜 리뷰 | ~3분 | 0분 ✅ |
| 구현 | ~5분 | ~5분 |
| 코드 리뷰 | ~3분 | ~3분 |
| **총** | **~20분** | **~8분 (-60%)** |

## 안전장치

- 마커 파일 명시 생성 필수 (자동 적용 X) — 오용 차단
- 마커 ↔ active-ticket 정확 매칭 검증
- codex-review-guard hook은 그대로 작동 (보안 영역 차단 유지)
- approve_review notes에 "fast-track 적용" 명시 권장
- **`.gitignore` 등록 필수**: `.claude/active-ticket-fasttrack`이 커밋되면 다른 환경에서 의도치 않게 fast-track 적용 위험. 본 프로젝트는 이미 `.gitignore`에 등록됨 (`.claude/active-ticket-fasttrack`)
- **권장 단일 명령**: `echo "APS-X-Y" | tee .claude/active-ticket .claude/active-ticket-fasttrack` (오타로 인한 매칭 실패 방지)

## 참조

- 분류 기준: `.claude/rules/code-review.md` (1중/2중/3중)
- 정식 워크플로우: `.claude/rules/discovery-and-plan.md`
- Hook 동작: `.claude/hooks/plan-review-guard.sh`

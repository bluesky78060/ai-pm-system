# APS-1-4: Fast-track 정책 도입 — 방향 확정 문서

- **티켓**: APS-1-4
- **분류**: 1중 검증 (정책 + hook 변경)
- **작성**: 메인 직접 (단축 정책)

## 1. 목표 (Why)

단순 변경(1중 분류)에서 Discovery/플랜/플랜 리뷰 단계를 생략하고 바로 구현으로 진입할 수 있는 fast-track 모드 도입. 작업 중요도에 맞춘 워크플로우 차등 적용.

**성공 기준**: 단순 변경에서 작업 시작까지 시간 0분 (현재 ~10분).

## 2. 사용자 (Who)

- 메인 오케스트레이터 — 단순 변경 시 fast-track 자동 적용
- 사용자 — 빠른 수정 요청 시 즉시 진행 (티켓 발행 → 바로 구현)

## 3. 범위 (What)

### 포함
- **Fast-track 적용 분류 명시**: 1중 분류 작업 + 명시적 fast-track 요청
- **마커 파일 도입**: `.claude/active-ticket-fasttrack` 존재 시 hook 우회
- **plan-review-guard.sh hook 수정**: fast-track 마커 있으면 산출물 검증 생략
- **CLAUDE.md / rules 보강**: fast-track 워크플로우 명시

### 제외
- 단축이 위험한 영역 (보안/결제/DB/3중 분류) — fast-track 차단 유지
- 자동 분류 (사용자 또는 메인이 명시적 결정)

## 4. 제약 (Constraints)

- bash hook 호환 유지
- 기존 21+ 시나리오 회귀 0
- fast-track 적용 시에도 코드 리뷰는 의무 (1중)

## 5. 우선순위 (Priority)

- **P2** (단축 사이클 마무리)

## 6. 리스크 (Risk)

| 리스크 | 영향 | 대응 |
|--------|------|------|
| Fast-track 오용 (중요 변경에 적용) | 큼 | 분류 기준 명확 + 마커 파일 명시적 생성 필수 |
| hook 회귀 | 중 | 기존 + 신규 시나리오 검증 |
| 마커 잔존 (cleanup 누락) | 저 | 티켓 갱신 시 자동 cleanup 권장 |

## 7. 검증 (Verify)

### DoD
- `plan-review-guard.sh` fast-track 마커 우회 로직 추가
- `.claude/rules/code-review.md` 또는 새 파일에 fast-track 분류 명시
- CLAUDE.md 인덱스 갱신
- 시나리오 검증: 마커 있을 때 통과 / 없을 때 차단 (회귀 유지)

### 분류
- 1중 검증 (정책 + 단순 hook 수정)

---
paths:
  - "docs/05-deploy/**"
---

# gstack 통합 (옵션 2: 배포 자동화)

워크플로우 7단계(smart_workflow done) 이후 배포 단계를 gstack 4개 스킬로 자동화.

## 1회 셋업 (프로젝트당 최초 1회)

```
/setup-deploy
```

- Render 배포 설정 자동 감지 (production URL, health endpoint, deploy status)
- 결과를 CLAUDE.md에 기록 → 이후 모든 `/land-and-deploy` 호출이 자동화됨
- **현재 배포 대상**: `https://ai-pm-system.onrender.com`

## 배포 단계별 자동 트리거 매핑

| 단계 | gstack 스킬 | 역할 |
|------|-------------|------|
| 8단계 PR 생성 | `/ship` | 테스트 + 리뷰 + VERSION 범프 + CHANGELOG + push + PR |
| 9단계 머지/배포 | `/land-and-deploy` | PR 머지 + CI 대기 + Render 배포 + 헬스 체크 |
| 10단계 모니터링 | `/canary` | 콘솔 에러 + 성능 회귀 + 스크린샷 베이스라인 비교 |

## 배포 흐름

```
smart_workflow(approve_review)
  ↓ (자동 done 전환)
/ship → PR 생성
  ↓
/land-and-deploy → Render 머지 + 배포 + 헬스 체크
  ↓
/canary → 배포 후 모니터링 (이상 시 롤백 시그널)
```

## 분기별 보안/품질 점검 (선택)

- `/cso` 분기 1회 — OWASP Top 10 + STRIDE 보안 감사
- `/health` 주 1회 — 코드 품질 가중 점수 (tsc + lint + test + dead-code)

## 산출물

- `docs/05-deploy/{ticket-id}-deploy-report.md`
  - PR URL, CI 결과, 배포 시각, 헬스 체크 결과, canary 모니터링 요약
  - 이상 징후 발생 시 롤백/핫픽스 기록

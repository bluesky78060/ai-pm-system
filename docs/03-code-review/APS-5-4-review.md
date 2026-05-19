# APS-5-4 코드 리뷰 (1중 — WONT_FIX 종료)

**대상**: Neon PITR history retention 7일+ 확장
**리뷰어**: 메인 오케스트레이터
**일시**: 2026-05-19
**분류**: 1중 (인프라 메타 ticket, 코드 변경 없음)
**작성자**: human (사용자 결정)

## 결정 사항

**WONT_FIX** — 사용자가 retention 확장 진행 안 함으로 명시적 결정.

## 배경

APS-2-7 사고 시 Neon PITR(6시간 retention)로 즉시 복구 가능했으나, 사고 발견 지연 시 복구 불가 위험이 잔존. 본 ticket은 retention을 7일+로 확장하여 안전 margin을 늘리려는 후속 작업이었음.

## 보류 사유 (사용자 결정)

- Neon free plan은 history retention 최대 24시간 제한 → 7일+는 Pro plan 이상 필요
- storage 비용 증가 (33MB → 7일 시 추정 100~500MB)
- Console 작업 + plan 한도 확인이 필요한 사용자 작업
- 현재 환경에서 6시간 retention이 운영상 허용 범위로 판단됨

## 잔존 위험

- 사고 발견이 6시간 지연되면 PITR 불가
- 완화책: APS-5-1/5-6/5-7/5-10에서 다층 방어(`scoped cleanup`, `pre-commit hook`, `DATABASE_URL guard`, `TLS verification`) 구축으로 사고 가능성 자체를 줄임

## 검증

코드 변경 없음. 빌드/테스트 영향 없음.

## 최종 판정

**APPROVED (WONT_FIX)** — 사용자 결정에 따른 명시적 종료. 향후 plan 업그레이드 시 재검토 가능.

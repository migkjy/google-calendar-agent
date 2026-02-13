// TODO: OAuth 2.0 토큰 관리
// - getAuthUrl(): OAuth 인증 URL 생성
// - exchangeCode(code): authorization_code → access_token + refresh_token 교환
// - getValidToken(): DB에서 토큰 조회 → 만료 시 자동 갱신 → 유효한 access_token 반환
// - refreshAccessToken(refreshToken): refresh_token으로 access_token 갱신
// - saveToken(tokenData): DB에 토큰 저장/업데이트

@echo off
REM Windows 환경에서 Vite 개발 서버 실행
SETLOCAL
REM Node.js 설치 경로를 필요에 따라 수정하세요.
SET "PATH=C:\Program Files\nodejs;%PATH%"
rem npx 를 사용하여 vite 실행
npx vite
ENDLOCAL

#!/usr/bin/env bash
set -euo pipefail
apk="${1:?Informe o caminho do APK}"
package='space.manus.barberhp.t054228665129522'
out='../build-artifacts/startup-check'
mkdir -p "$out"
collect() {
  adb logcat -d > "$out/logcat.txt" 2>&1 || true
  adb exec-out screencap -p > "$out/login-screen.png" 2>/dev/null || true
}
trap collect EXIT
adb wait-for-device
adb install -r "$apk"
adb shell input keyevent 82
adb shell am force-stop "$package"
adb logcat -c
adb shell am start -W -n "$package/.MainActivity"
found=0
for attempt in $(seq 1 15); do
  sleep 3
  pid="$(adb shell pidof "$package" | tr -d '\r')"
  if [ -z "$pid" ]; then
    echo 'FALHA: processo encerrou depois da tela de abertura.'
    exit 1
  fi
  adb shell uiautomator dump /sdcard/barber-startup.xml > /dev/null 2>&1 || true
  adb pull /sdcard/barber-startup.xml "$out/login-screen.xml" > /dev/null 2>&1 || true
  if [ -f "$out/login-screen.xml" ] && grep -q 'Entrar' "$out/login-screen.xml" && (grep -q 'E-mail' "$out/login-screen.xml" || grep -q 'WhatsApp' "$out/login-screen.xml"); then
    found=1
    break
  fi
  echo "Aguardando a tela de login: tentativa $attempt"
done
if [ "$found" -ne 1 ]; then
  echo 'FALHA: a tela de login não apareceu.'
  exit 1
fi
sleep 15
if [ -z "$(adb shell pidof "$package" | tr -d '\r')" ]; then
  echo 'FALHA: o aplicativo encerrou após carregar o login.'
  exit 1
fi
adb shell input keyevent 3
sleep 2
adb shell am start -W -n "$package/.MainActivity"
sleep 5
adb shell uiautomator dump /sdcard/barber-startup.xml > /dev/null
adb pull /sdcard/barber-startup.xml "$out/login-screen.xml" > /dev/null
if ! grep -q 'Entrar' "$out/login-screen.xml" || ! (grep -q 'E-mail' "$out/login-screen.xml" || grep -q 'WhatsApp' "$out/login-screen.xml"); then
  echo 'FALHA: a tela de login não permaneceu disponível ao reabrir.'
  exit 1
fi
printf '%s\n' 'PASS: instalação, abertura a frio, tela Entrar/E-mail, permanência e reabertura do APK em emulador Android. Nenhum login ou POST em produção foi feito.' > "$out/RESULTADO.txt"
cat "$out/RESULTADO.txt"

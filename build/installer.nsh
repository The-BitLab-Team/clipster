; Ganchos do instalador NSIS (electron-builder inclui este arquivo sozinho).

!macro customUnInstall
  ; "Iniciar com o sistema" (SPEC §27.2): desinstalar remove a entrada de inicialização, que
  ; o Electron grava com o AppUserModelID. Numa atualização, ela fica: o app continua igual.
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.marcosland.clipster"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "com.marcosland.clipster"
  ${endIf}
!macroend

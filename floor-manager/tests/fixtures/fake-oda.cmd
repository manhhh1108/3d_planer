@echo off
rem args: %1=input dir  %2=output dir  (các arg sau bỏ qua)
for %%f in (%1\*.dwg) do copy /y "%~dp0box.dxf" "%~2\%%~nf.dxf" >nul

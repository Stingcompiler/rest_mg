@echo off
cd /d "E:\sudan-pos\api"

call venv\Scripts\activate.bat

python manage.py runserver

pause
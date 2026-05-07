FROM python:3.13-slim
RUN pip install --no-cache-dir psycopg2-binary requests
COPY proof.py /proof/proof.py
CMD ["python", "/proof/proof.py"]

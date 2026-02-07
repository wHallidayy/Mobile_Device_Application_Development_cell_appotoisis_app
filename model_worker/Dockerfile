FROM continuumio/miniconda3:latest

# Set working directory
WORKDIR /app

# Install system dependencies for OpenCV and image processing
RUN apt-get update && apt-get install -y \
                    libgl1-mesa-glx \
                    libglib2.0-0 \
                    libsm6 \
                    libxext6 \
                    libxrender-dev \
                    libpq-dev \
                    gcc \
                    g++ \
                    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies using pip (in base conda environment)
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Ensure models directory exists
RUN mkdir -p /app/models

# Health check - verify Python can import main modules
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
                    CMD python -c "import worker; import inference; import config" || exit 1

# Run the worker
CMD ["python", "worker.py"]

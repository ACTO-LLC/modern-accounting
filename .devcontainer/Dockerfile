# Dev container for Modern Accounting
FROM mcr.microsoft.com/devcontainers/base:ubuntu

# Install SQL Server tools for database operations
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && curl https://packages.microsoft.com/keys/microsoft.asc | apt-key add - \
    && curl https://packages.microsoft.com/config/ubuntu/22.04/prod.list > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y mssql-tools18 unixodbc-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Add sqlcmd to PATH
ENV PATH="$PATH:/opt/mssql-tools18/bin"

# Create workspace directory
WORKDIR /workspace

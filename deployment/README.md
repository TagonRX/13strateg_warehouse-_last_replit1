# Warehouse Management System - Deployment Package

## Quick Start (Ubuntu Server)

1. Copy entire project folder to Ubuntu Server
2. Navigate to `deployment` folder
3. Run scripts in order as root:

```bash
sudo bash 1-install-dependencies.sh
sudo bash 2-setup-database.sh
sudo bash 3-install-app.sh
sudo bash 4-setup-service.sh
sudo bash 5-start.sh
```

4. Open browser: `http://SERVER-IP:5000`
5. Login: `admin` / `admin123`

## Full Documentation

See **УСТАНОВКА.md** for complete Russian documentation.

## System Requirements

- Ubuntu Server 20.04/22.04/24.04
- 4GB RAM minimum (8GB recommended)
- 20GB disk space
- Root access

## What Gets Installed

- Node.js 20.x
- PostgreSQL 16
- Warehouse Management System
- Systemd service for auto-start

## Files Created

- `/opt/warehouse/` - Application
- `/opt/warehouse/warehouse.env` - Configuration (passwords)
- `/etc/systemd/system/warehouse.service` - Service definition

## Service Management

```bash
sudo systemctl status warehouse   # Check status
sudo systemctl start warehouse    # Start
sudo systemctl stop warehouse     # Stop
sudo systemctl restart warehouse  # Restart
sudo journalctl -u warehouse -f   # View logs
```

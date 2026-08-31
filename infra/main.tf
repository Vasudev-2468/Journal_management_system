# JGAIR single-EC2 deploy on AWS.
#
# What this provisions:
#   - S3 bucket for manuscript PDFs (private, blocked from public access)
#   - IAM instance role that grants the EC2 read/write on that bucket
#   - Security group (SSH from your IP, HTTP+HTTPS from anywhere)
#   - EC2 instance running Ubuntu 24.04, cloud-init installs Docker + brings
#     up docker-compose from the checked-out repo
#   - Elastic IP so the address survives reboots
#
# Cost (us-east-1, low traffic): ~$18–20/month on t3.small.
#
# Not provisioned (do these outside Terraform for a solo setup):
#   - Route 53 hosted zone or DNS records — point A records at the elastic_ip
#     output at your registrar
#   - TLS certs — Caddy inside the compose stack fetches Let's Encrypt certs
#     automatically the first time the domain is hit
#   - Nightly Postgres backups to S3 — set the cron on the box after boot
#     (see the README / the manual deploy walkthrough)

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

# ── Variables ─────────────────────────────────────────────

variable "region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Short project name used to prefix resources"
  type        = string
  default     = "jgair"
}

variable "environment" {
  description = "Environment tag (e.g. prod, staging)"
  type        = string
  default     = "prod"
}

variable "instance_type" {
  description = "EC2 instance size. t3.small (~2 GB RAM) is the safe minimum."
  type        = string
  default     = "t3.small"
}

variable "ssh_key_name" {
  description = "Name of an existing EC2 key pair for SSH access (create in EC2 console first)"
  type        = string
}

variable "ssh_ingress_cidr" {
  description = "CIDR allowed to SSH in. Use your public IP + /32 to lock down."
  type        = string
  default     = "0.0.0.0/0"
}

variable "s3_bucket_name" {
  description = "S3 bucket for manuscript PDFs. Must be globally unique."
  type        = string
}

variable "root_volume_size_gb" {
  description = "EBS root volume size. Default 8 GB is too small for Docker + Postgres."
  type        = number
  default     = 30
}

variable "github_repo_url" {
  description = "HTTPS clone URL for the app repo — required; forks must override this"
  type        = string
  # No default — a fork/clone that forgets to set this would otherwise
  # silently deploy the upstream Vasudev-2468 fork's main branch.
}

variable "domain" {
  description = "Public domain the frontend will serve at (e.g. jgair.example.com)"
  type        = string
}

variable "api_domain" {
  description = "Public domain the backend/API will serve at (e.g. api.jgair.example.com)"
  type        = string
}

# ── Application secrets ───────────────────────────────────
# These are injected into the EC2's /home/ubuntu/Journal_management_system/backend/.env
# via cloud-init. Mark sensitive so Terraform doesn't print them.

variable "postgres_password" {
  description = "Password for the in-container Postgres 'journaladmin' user"
  type        = string
  sensitive   = true
}

variable "secret_key" {
  description = "FastAPI SECRET_KEY (generate with: openssl rand -hex 32)"
  type        = string
  sensitive   = true
}

variable "openai_api_key" {
  description = "OpenAI API key (optional but recommended — powers Agent 2/3 features)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "anthropic_api_key" {
  description = "Anthropic API key (optional)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "sendgrid_api_key" {
  description = "SendGrid API key (optional — leave blank to disable outbound email)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "sendgrid_from_email" {
  description = "Verified sender for SendGrid"
  type        = string
  default     = ""
}

# ── Discovery: latest Ubuntu 24.04 AMI ────────────────────

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ── S3 bucket for manuscript PDFs ─────────────────────────

resource "aws_s3_bucket" "manuscripts" {
  bucket = var.s3_bucket_name

  tags = {
    Project     = var.project
    Environment = var.environment
    Purpose     = "manuscript-pdfs"
  }
}

resource "aws_s3_bucket_public_access_block" "manuscripts" {
  bucket = aws_s3_bucket.manuscripts.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "manuscripts" {
  bucket = aws_s3_bucket.manuscripts.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "manuscripts" {
  bucket = aws_s3_bucket.manuscripts.id

  rule {
    id     = "expire-old-backups"
    status = "Enabled"

    filter {
      prefix = "backups/"
    }

    expiration {
      days = 30
    }
  }
}

# ── IAM: instance role granting S3 access ─────────────────

resource "aws_iam_role" "ec2_role" {
  name = "${var.project}-${var.environment}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = "sts:AssumeRole"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy" "s3_access" {
  name = "${var.project}-${var.environment}-s3-access"
  role = aws_iam_role.ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
      ]
      Resource = [
        aws_s3_bucket.manuscripts.arn,
        "${aws_s3_bucket.manuscripts.arn}/*",
      ]
    }]
  })
}

resource "aws_iam_instance_profile" "ec2_profile" {
  name = "${var.project}-${var.environment}-ec2-profile"
  role = aws_iam_role.ec2_role.name
}

# ── Networking: security group ────────────────────────────

resource "aws_security_group" "app" {
  name        = "${var.project}-${var.environment}-sg"
  description = "JGAIR app: SSH (locked to admin CIDR), HTTP, HTTPS"

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_ingress_cidr]
  }

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

# ── EC2 instance ──────────────────────────────────────────

resource "aws_instance" "app" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = var.ssh_key_name
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_profile.name

  root_block_device {
    volume_size           = var.root_volume_size_gb
    volume_type           = "gp3"
    delete_on_termination = true
    encrypted             = true
  }

  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    github_repo_url     = var.github_repo_url
    domain              = var.domain
    api_domain          = var.api_domain
    postgres_password   = var.postgres_password
    secret_key          = var.secret_key
    openai_api_key      = var.openai_api_key
    anthropic_api_key   = var.anthropic_api_key
    sendgrid_api_key    = var.sendgrid_api_key
    sendgrid_from_email = var.sendgrid_from_email
    aws_s3_bucket_name  = var.s3_bucket_name
    aws_region          = var.region
  })

  # Redeploy the instance if user-data changes.
  user_data_replace_on_change = true

  tags = {
    Name        = "${var.project}-${var.environment}"
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_eip" "app" {
  instance = aws_instance.app.id
  domain   = "vpc"

  tags = {
    Name        = "${var.project}-${var.environment}-eip"
    Project     = var.project
    Environment = var.environment
  }
}

# ── Outputs ───────────────────────────────────────────────

output "elastic_ip" {
  description = "Point A records for var.domain and var.api_domain at this IP"
  value       = aws_eip.app.public_ip
}

output "ssh_command" {
  description = "SSH into the box"
  value       = "ssh -i /path/to/${var.ssh_key_name}.pem ubuntu@${aws_eip.app.public_ip}"
}

output "s3_bucket_name" {
  description = "S3 bucket for manuscript PDFs"
  value       = aws_s3_bucket.manuscripts.id
}

output "first_boot_log_command" {
  description = "Tail the cloud-init log to watch the first-boot install"
  value       = "ssh -i /path/to/${var.ssh_key_name}.pem ubuntu@${aws_eip.app.public_ip} 'sudo tail -f /var/log/user-data.log'"
}

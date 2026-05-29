// Phase 3+ : Azure 资源 IaC 草案占位。
// 推荐资源：AKS / Container Apps、Azure Cache for Redis、Azure Database for PostgreSQL Flexible Server、
//          Azure Front Door、Application Insights、Key Vault、Storage（Replay）。
targetScope = 'resourceGroup'

@description('Project prefix')
param prefix string = 'guandan'

@description('Location')
param location string = resourceGroup().location

output prefixOut string = prefix
output locationOut string = location

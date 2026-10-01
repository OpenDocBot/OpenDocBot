---
title: Microsoft Entra ID
description: Register OpenDocBot in Microsoft Entra ID and use it as the identity provider for a self-hosted instance.
---

# Microsoft Entra ID

This guide describes how to configure Microsoft Entra ID (formerly Azure AD) as 
an identity provider for access control to the OpenDocBot addin. The guide assumes a 
self-hosted OpenDocBot instance. For the general setup, see [Single Sign-On](/docs/enterprise/sso).

## 1. Access the Entra admin center

1. Access the [Azure Portal](https://portal.azure.com) with an admin account
2. Search for the Entra ID service

![Searching for the Entra ID service in the Azure Portal](/enterprise/entra-id/1.jpg)


## 2. Register the application

1. In the Entra admin center, go to **Manage > App registrations** and choose
   **New registration**.

![Creating a new app registration in Entra ID](/enterprise/entra-id/2.png) 

2. Give it a name, for example `OpenDocBot`.
3. Under **Supported account types**, pick the option that matches your
   organization. Most deployments use **Single tenant only**.
3. In the redirect URI, select the platform `Web` and set the redirect URI
to `https://<your-host>/auth/callback`, replacing `<your-host>` with the public 
address of your OpenDocBot instance.

![Adding the Web redirect URI to the app registration](/enterprise/entra-id/3.png)

## 3. Create a client secret

1. In the newly created app registration, go to ** Manage > Certificates & secrets** and choose **New client secret**.

![Creating a new client secret](/enterprise/entra-id/4.png)

2. Set an expiry and create it.
3. Copy the secret **value** right away. The secret ID is not enough, and the
   value is only shown once.

![Copying the client secret value](/enterprise/entra-id/5.png)


## 4. Configure OpenDocBot

Navigate to your app registration overview, and find the following values:
- Application (client) ID
- Directory (tenant) ID

![App Overview showing the Application and Directory IDs](/enterprise/entra-id/8.png)


Set these in the server's `.env` and restart:

```dotenv
OPENDOCBOT_OIDC_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0
OPENDOCBOT_OIDC_CLIENT_ID=<client-id>
OPENDOCBOT_OIDC_CLIENT_SECRET=<client-secret-value>
```

After the server restart, the OpenDocBot addin will request users to login with their enterprise account.

![OpenDocBot asking the user to sign in](/enterprise/entra-id/9.png)

Only users with a sucessful login will be able to use the addin.

## 5. (Optional) Manage access via Entra ID groups

This step is only needed if you want to restrict access by Entra ID group.

1. In your Entra app registration, navigate to **Manage > Token configuration** and choose **Add groups claim**.

![Adding the groups claim in Token configuration](/enterprise/entra-id/6.png)

2. Select which groups and reported and in which format, Then click Add.  In this example, we will be reporting all groups by ID.

![Selecting the group types and format for the groups claim](/enterprise/entra-id/7.png) 

Since we are reporting groups by ID, add a list of allowed group IDs to `OPENDOCBOT_OIDC_ALLOWED_GROUPS` in you server .env. With this 
configuration, the identity provider (Entra) will be reporting to your OpenDocBot server the group membership of every loged user. OpenDocBot
will restrict the access only to the users in at least one of the groups configured in `OPENDOCBOT_OIDC_ALLOWED_GROUPS`.




## Good to know

- The issuer must point at the v2 endpoint and end in `/v2.0`. If sign-in fails
  with `invalid id_token issuer`, check this value first.
- If a user belongs to many groups, Entra sends a group overage instead of the
  list, and the sign-in is refused. Enable assignment on the enterprise
  application and assign only the groups you need.
- If your OpenDocBot server is behind a reverse proxy, set `OPENDOCBOT_OIDC_REDIRECT_URI` explicitly. See
  [Single Sign-On](/docs/enterprise/sso#behind-a-reverse-proxy).

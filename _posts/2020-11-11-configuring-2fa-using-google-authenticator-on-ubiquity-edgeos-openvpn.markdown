---
layout: post
title:  "Configuring Google Authenticator on Ubiquity EdgeOS OpenVPN"
date:   2021-05-19 11:41:00 +0100
categories: security
---

The following guide will help you to set up Google Authenticator based 2FA for OpenVPN on EdgeOS 2.0+ devices. It's recommended to ensure you have another method to access your device in case you accidentally lose VPN access during the process. All steps should be run as `root` unless specified.

## Install Dependencies

Run the following to install the required dependencies.

{% highlight bash %}
apt-get update
apt-get -y install libqrencode3 easy-rsa libpam-google-authenticator
{% endhighlight %}

## Configure PAM

If you'd like to use a 2FA code and a certificate to log in without the user's password, you can use (as root):

{% highlight bash %}
cd /etc/pam.d
cp common-account openvpn
echo "auth required /lib/mips-linux-gnu/security/pam_google_authenticator.so" >> openvpn
{% endhighlight %}

Otherwise, to require the user's password as well as 2FA and certificate, use:

{% highlight bash %}
cd /etc/pam.d
cp common-account openvpn
echo "auth requisite pam_google_authenticator.so forward_pass" >> openvpn
echo "auth required pam_unix.so use_first_pass" >> openvpn
{% endhighlight %}

## Configure OpenVPN

Configure OpenVPN to use the PAM configuration we set up previously.

{% highlight bash %}
configure
set interfaces openvpn vtun0 openvpn-option '--plugin /usr/lib/openvpn/openvpn-auth-pam.so openvpn'
commit
save
exit
{% endhighlight %}

## Add New User

If you already have a user that you'd like to configure 2FA for, you can skip this step. I recommend you set up a new user to test this with though, to prevent accidentally locking your existing user out if the configuration doesn't work.

You can run the following to generate a new user. Remember to switch out the `USERNAME` parameter to whatever you choose. The password parameter will be set to a random 64 character password.

{% highlight bash %}
export USERNAME=my-user
export PASSWORD=`cat /dev/urandom | tr -dc _A-Z-a-z-0-9 | head -c64;`
configure
set system login user "${USERNAME}" authentication plaintext-password "${PASSWORD}" 
commit
save
exit
echo "Created user ${USERNAME} with password ${PASSWORD}."
{% endhighlight %}

## Create User Certificate

Again, you can skip this step if you already have a certificate set up for the chosen user.

First we need to generate a certificate request for the user. Again, replace `my-user` in the below:

{% highlight bash %}
cd /usr/lib/ssl/misc
./CA.pl -newreq my-user
{% endhighlight %}

You'll need to set the common name to the username of the user being added.

Next up we can sign the user's certificate. You'll need to enter the CA passphrase here.

{% highlight bash %}
./CA.pl -sign
{% endhighlight %}

And finally spit out the keys for the user, removing after they have been securely stored.

{% highlight bash %}
cat newcert.pem
cat newkey.pem
rm newcert.pem
rm newkey.pem
{% endhighlight %}


## Configure 2FA

Configure 2FA for the user. Replace `my-user` with the user of your choice, and the label with whatever you like. When you run this you'll see a QR code which you can scan to setup your 2FA app. Alternatively just copy the key from underneath the QR code.

{% highlight bash %}
sudo su -c "google-authenticator --label=\"My OpenVPN 2FA\"" my-user
{% endhighlight %}

You'll be prompted to answer a few questions about the particular setup you want, which I encourage you to read and choose for yourself. Here are my typical selections:

{% highlight bash %}
Do you want me to update your "/home/my-user/.google_authenticator" file (y/n) y

Do you want to disallow multiple uses of the same authentication
token? This restricts you to one login about every 30s, but it increases
your chances to notice or even prevent man-in-the-middle attacks (y/n) y

By default, tokens are good for 30 seconds and in order to compensate for
possible time-skew between the client and the server, we allow an extra
token before and after the current time. If you experience problems with poor
time synchronization, you can increase the window from its default
size of 1:30min to about 4min. Do you want to do so (y/n) n

If the computer that you are logging into isn't hardened against brute-force
login attempts, you can enable rate-limiting for the authentication module.
By default, this limits attackers to no more than 3 login attempts every 30s.
Do you want to enable rate-limiting (y/n) y
{% endhighlight %}

Next, ensure permissions for the Google authenticator setup are set to only allow access to the owner.

{% highlight bash %}
sudo chmod 400 /home/openvpn-user/.google_authenticator
{% endhighlight %}


## Generate the Client Config

Finally, on the client machine, you'll want an `.ovpn` config file to pass on to the user along with their certificate details.

I suggest creating a new directory to store this and the associated files.

You'll want to replace the following placeholders:

| Placeholder | Value |
|-------------|-------|
| {IP}        | The public IP of your Edge router in place of the placeholder on line 4.
| {USERNAME}  | The username you created in the previous steps.

{% highlight bash %}
client
dev tun
proto udp
remote {IP} 1194
float
resolv-retry infinite
nobind
persist-key
persist-tun
verb 3
ca cacert.pem
cert {USERNAME}.pem
key {USERNAME}.key
auth-user-pass
{% endhighlight %}

Call this file `config.ovpn`.

The files which you stored earlier (the outputs of `newcert.pem` and `newkey.pem` should be written to `{USERNAME}.pem` and `{USERNAME}.key` respectively.

You should write the contents of `/usr/lib/ssl/misc/demoCA/cacert.pem` on the Edge router to `cacert.pem`.

At this point you should be able to connect to the VPN. Run:

```
sudo openvpn config.ovpn
```

The first password that is requested is your 2FA code. The subsequent passphrase will be your key passphrase that you entered when generating a certificate for the user.


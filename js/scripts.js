(function( $ ){

	// fullscreen gallery
	var $fullscreen_gallery = jQuery('.fullscreen-gallery.gallery');
	if ( $fullscreen_gallery.length > 0 ) {

		// If we have a pool of project images, shuffle and inject them
		if (window._allProjectImages && window._allProjectImages.length > 0) {
			var pool = window._allProjectImages.slice();
			// Remove the first image from the pool so it's not duplicated
			var firstImg = window._firstImage || '';
			pool = pool.filter(function(src) { return src !== firstImg; });
			// Fisher-Yates shuffle
			for (var i = pool.length - 1; i > 0; i--) {
				var j = Math.floor(Math.random() * (i + 1));
				var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
			}
			// Append shuffled images as new slides
			pool.forEach(function(src) {
				$fullscreen_gallery.append(
					'<figure class="gallery-item"><header class="gallery-icon">' +
					'<img src="' + src + '" loading="lazy">' +
					'</header></figure>'
				);
			});
		}

		if ( $fullscreen_gallery.find('.gallery-item').length > 1 ) { // if there are more than 1 image
			
			if ( !$fullscreen_gallery.hasClass('kenburns-gallery') ) {	// do not initialize if kenburns

				$fullscreen_gallery.cycle({
					slideExpr: '.gallery-item',
					fx:        'fade', 
		   			speed:     1000, 
					timeout:   5000,
					cleartypeNoBg : true
				});
			}
		}
	}



	// kenburns on one featured image header image
	// DISABLED - using regular cycle slideshow instead
	/*
	var $kenburns = jQuery('.kenburns-gallery.gallery');
	if ( $kenburns.length > 0 ) {
		var gallery_set = [];
		$kenburns.find('.gallery-icon img').each( function() {
			gallery_set.push(jQuery(this).attr('src'));
		});

		jQuery('#kenburns').attr('width', jQuery(window).width());
		jQuery('#kenburns').attr('height', jQuery(window).height());
		jQuery('#kenburns').kenburns({
			images: gallery_set,
			frames_per_second: 30,
			display_time: 5000,
			fade_time: 1000,
			zoom: 1.2,
			background_color:'#F7F6F5'
		});
	}
	*/

	
	
	
	/* ********* WINDOW LOAD ********** */
	jQuery(window).load(function() {
	
		// load screen
		jQuery('.loadreveal').addClass('reveal');
		jQuery('#loadscreen').stop().animate( { opacity: 0 }, 200, function() {
			jQuery('body.home').removeClass('loading');
			jQuery(this).hide();
		});
	
	
		// masonry gallery
		var $masonry_gallery = jQuery('.masonry-gallery.gallery');
		if ( $masonry_gallery.length > 0 ) {

			$masonry_gallery.each( function(index, element) {
				var $masonry_items = $(element).find('.gallery-item');
				var $images = $(element).find('img');
				var loadedImages = 0;
				var totalImages = $images.length;
				
				// Function to initialize or re-layout isotope
				function initIsotope() {
					if (!$(element).data('isotope')) {
						// First time init
						$(element).isotope({
							masonry: { columnWidth: $(element).find('.gallery-item')[0] },
							itemSelector: '.gallery-item'
						});
					} else {
						// Re-layout after images load
						$(element).isotope('layout');
					}
				}
				
				// Initialize isotope immediately
				initIsotope();
				
				// Re-layout when each image loads
				$images.each(function() {
					if (this.complete) {
						loadedImages++;
						if (loadedImages === totalImages) {
							initIsotope();
						}
					} else {
						$(this).on('load', function() {
							loadedImages++;
							initIsotope();
						});
					}
				});
				
				// Also re-layout after a short delay as fallback
				setTimeout(function() {
					$(element).isotope('layout');
				}, 500);
					
				// filtering
				jQuery('#gallery-filter li a').on('click', function(){
					jQuery('#gallery-filter li a').removeClass('active');
					jQuery(this).addClass('active');
					var selector = jQuery(this).attr('data-filter');
					$masonry_gallery.isotope({ filter: selector });
					return false;
				});

				// changing layout
				jQuery('#grid-changer li a').on('click', function(){
					jQuery('#grid-changer li a').removeClass('active');
					jQuery(this).toggleClass('active');

					$masonry_items.removeClass('col-3');
					$masonry_items.removeClass('col-4');
					$masonry_items.removeClass('col-5');
					$masonry_items.toggleClass(jQuery(this).closest('li').attr('class'));
					$masonry_gallery.isotope('layout');
				});
			
			});
		}

		
		// before-after
		var $before_after = jQuery('.before-after.gallery');
		if ( $before_after.length > 0 ) {
			$before_after.imageReveal({
				barWidth: 4,
				touchBarWidth: 50,
				startPosition: 0.5,
				width: jQuery('.before-after img').width(),
				height:  jQuery('.before-after img').height()
			});
		}

		// changing blog layout
		var $blog_layout = jQuery('#blog-timeline');
		if ( $blog_layout.length > 0 ) {
	
			jQuery('#grid-changer li a').on('click', function(){
				jQuery('#grid-changer li a').removeClass('active');
				jQuery(this).toggleClass('active');

				$blog_layout.closest('.wrapper').toggleClass('blog-masonry');
				
				if ( $blog_layout.closest('.wrapper').hasClass('blog-masonry') ) {
					jQuery('#blog-post').animate({'left': '100%'}, 400, function() {
						// set masonry layout
						$blog_layout.isotope({
							masonry: { columnWidth: $blog_layout.find('article')[0], gutter: 60 },
							itemSelector: 'article'
						});
						$blog_layout.isotope('layout');
						jQuery('#blog-post').hide();
					});
				}
				else {
					jQuery('#blog-post').show().animate({'left': '0'}, 400 );
					$blog_layout.isotope('destroy');
					
					if ( $masonry_gallery.length > 0 ) {
						$masonry_gallery.isotope('layout');
					}
				}
			});
		}
	});
	

} )( jQuery );

(() => {
  'use strict';

  const MetaformApiClient = require('metaform-api-client');
  const Keycloak = require('keycloak-js');
  const config = require('../../config.json');
  
  class MikseiMikkeli {
    constructor(options) {
      this.realmId = config.keycloak.realmId;
      this.metaformId = config.metaform.metaformId;
      this.protocol = `${config.secure ? 'https://' : 'http://'}`;
      this.apiUrl = `${this.protocol}${config.server.host}:${config.server.port}`;
      this.serverUrl = `${this.protocol}${config.keycloak.host}:${config.keycloak.port}`;
      this.replyApi = new MetaformApiClient.RepliesApi();
      this.client = MetaformApiClient.ApiClient.instance;
      this.metaformsApi = new MetaformApiClient.MetaformsApi(); 
      this.minTokenValidity = 5;
      this.keycloak = null; 
    }

    getMetaform(metaformId) {
      return new Promise((resolve, reject) => {
        this.getToken().then((apiKey) => {
          MetaformApiClient.ApiClient.instance.basePath = `${this.apiUrl}/v1`;

          this.client.authentications.bearer = Object.assign({}, this.client.authentications.bearer, {
            apiKeyPrefix: 'Bearer',
            apiKey: apiKey
          });

          this.metaformsApi.findMetaform(this.realmId, this.metaformId).then((data) => {
            resolve(data);
          }, (error) => {
            reject();
          });
        });
      });
    }

    submitForm () {
      return new Promise((resolve, reject) => {
        const replyData = this.getFormValues();
        const payload = {
          data: replyData,
          userId: this.userId,
          id: config.metaform.metaformId
        };

        this.replyApi.createReply(this.realmId, this.metaformId, payload, {updateExisting: false}).then((data) => {
          resolve();
        });
      });
    }

    getFormValues () {
      const formValues = {};
      $('.metaform-container form.metaform').metaform('val', true).forEach((value) => {
        formValues[value.name] = value.value;
      });
      return formValues;
    }

    getKeycloak () {
      if (!this.keycloak) {
        this.keycloak = Keycloak({
          url: `${this.serverUrl}/auth`,
          realm: config.keycloak.realmId,
          clientId: config.keycloak.clientId
        });
      }

      return this.keycloak;
    }
    
    resetKeycloak () {
      this.keycloak = null;
      this.getKeycloak();
    }

    initKeycloak (initOptions) {
      return new Promise((resolve, reject) => {
        this.getKeycloak().init(initOptions)
          .success((authenticated) => {
            resolve();
          });
      });
    } 

    getInitOptions (onLoad) {
      let initOptions = {
        onLoad: onLoad
      };

      if ('browser' === device.platform) {
        initOptions.adapter = 'default';
      }

      return initOptions;
    }

    authenticate () {
      this.keycloak = this.getKeycloak();

      return new Promise((resolve, reject) => {
        if (this.userIsAuthenticated()) {
          return resolve();
        }

        return this.initKeycloak(this.getInitOptions());
      });
    }

    getToken () {
      return new Promise((resolve, reject) => {
        this.authenticate().then(() => {
          this.keycloak.updateToken(this.minTokenValidity).success(() => {
            resolve(this.keycloak.token);
          }).error((err) => {
            console.error("Error while updating token");
            reject();
          });
        });
      });
    }

    getUserId () {
      this.keycloak = this.getKeycloak();
      return this.keycloak.subject;
    }

    userIsAuthenticated () {
      this.keycloak = this.getKeycloak();
      return this.keycloak.authenticated ? true : false;
    }

    logout () {
      this.keycloak = this.getKeycloak();
      return this.keycloak.logout();
    }
  }
 
  $.widget("custom.mikseiMikkeli", {  
    _create: function () {
      this.mikseiMikkeli = new MikseiMikkeli;
      this.pageId = 'news';
      this.renderPage(this.pageId);
      this.initKeycloak('check-sso');
      
      $(document).on('click', '.toggle-navigation', $.proxy(this.toggleNavigation, this));
      $(document).on('click', '.navigation', $.proxy(this.closeNavigation, this));
      $(document).on('click', '.change-page', $.proxy(this.navigationItemClicked, this));
      $(document).on('click', 'input[type="submit"]', $.proxy(this.submitMetaform, this));
      $(document).on('click', '.login', $.proxy(this.login, this));
      $(document).on('click', '.logout', $.proxy(this.logout, this));
    },
    
    closeNavigation: function () {
      if ($('.navigation').hasClass('open')) {
        this.toggleNavigation();
      }
    },
    
    initKeycloak: function (onLoad) {
      this.initOptions = this.mikseiMikkeli.getInitOptions(onLoad);
      this.mikseiMikkeli.initKeycloak(this.initOptions);
    },
    
    navigationItemClicked: function (event) {
      const element = $(event.currentTarget);
      const pageId = element.attr('data-page-id');
      this.changePage(pageId);
    },
    
    renderPage: function (pageId) {
      switch (pageId) {
        case 'news':
          this.renderNews();
          break;
        case 'metaform':
          this.renderMetaform();
          break;
        default:
          this.renderNews();
      }
    },
    
    togglePageDisplay: function (pageId) {
      $(`[data-page="${this.pageId}"]`).hide();
      $(`[data-page="${pageId}"]`).show();
      this.pageId = pageId;
    },
    
    changePage: function (pageId) {
      this.toggleNavigation();
      this.renderPage(pageId);
    },
    
    renderNews: function () {
      this.togglePageDisplay('news');
      $.get(config.miksei.newsUrl, (data) => {
        const news = data.reverse();
        
        for (let i = 0; i < 10; i++) {
          $('.news-container').append(
          `<div class="news-article">
            <div class="news-article-heading" onclick="window.open('${news[i].url}', '_blank', 'location=yes,shouldPauseOnSuspend=yes');" style="cursor:pointer;">
              <a href="#">
                <h2>${news[i].heading}</h2>
              </a>
            </div>
            <div class="news-article-image" style="background-image:url('${news[i].img}')">
            </div>
          </div>
          `
          );
        }
      });
    },
    
    renderMetaform: function () {
      if (this.mikseiMikkeli.userIsAuthenticated()) {
        this.togglePageDisplay('metaform');
        return this.mikseiMikkeli.getMetaform().then((results) => {
          console.log(window.hyperform);
          const html = mfRender({
            viewModel: results,
            formValues: {}
          });

          $('.metaform-container').html(html);
          $('.metaform-container form.metaform').metaform();
        });
      } else {
        this.togglePageDisplay('news');
      }
    },

    resetFormValues: function () {
      $('.metaform-container').html('');
      this.renderMetaform();
    },
    
    buildNavigation: function () {
      const navigationOptions = {
        authenticated: this.mikseiMikkeli.userIsAuthenticated()
      };
      
      $('.navigation-container').html(pugNavigation(navigationOptions));
    },
    
    toggleNavigation: function () {
      this.buildNavigation();
      if ($('.navigation').hasClass('open')) {
        $('.navigation').hide("slide", {direction: "up" });
        $('.navigation').removeClass('open');
        this.enableScroll();
      } else {
        $('.navigation').show("slide", {direction: "up" });
        $('.navigation').addClass('open');
        this.disableScroll();
      }
    },
    
    disableScroll: function () {
      $('html, body').css({
        overflow: 'hidden',
        height: '100%'
      });
    },
    
    enableScroll: function () {
      $('html, body').css({
        overflow: 'auto',
        height: 'auto'
      });
    },
    
    submitMetaform: function (event) {
      event.preventDefault();
      this.mikseiMikkeli.submitForm().then(() => {
        this.displayAlert(true, 'Lomake lähetettiin onnistuneesti.');
        this.resetFormValues();
      });
    },
    
    logout: function () {
      this.mikseiMikkeli.getKeycloak().logout();
      this.mikseiMikkeli.resetKeycloak();
      this.renderPage('news');
    },
    
    login: function () {
      this.initKeycloak('login-required');
    },
    
    displayAlert: function (success, message) {
      $('.alert').addClass(success ? 'alert-success' : 'alert-danger');
      $('.alert').html(`<p>${message}</p>`);
      $('.alert').show();
      
      setTimeout(() => {
        $('.alert').hide();
      }, 2000);
    }
  });
  
  $(document).on("deviceready", () => {
    if (cordova.InAppBrowser && device.platform !== 'browser') {
      window.open = (url, target, options) => {
        return cordova.InAppBrowser.open(url, target, options + ',zoom=no');
      };
    }
    
    $(document.body).mikseiMikkeli();
  });
})();
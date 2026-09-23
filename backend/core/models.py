from django.db import models

class GithubProfile(models.Model):
    github_username = models.CharField(max_length=100, unique=True)
    github_id = models.CharField(max_length=100, unique=True)
    encrypted_token = models.BinaryField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.github_username


class WrappedResult(models.Model):
    profile = models.ForeignKey(GithubProfile, on_delete=models.CASCADE, related_name='wrapped_results')
    data = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Wrapped for {self.profile.github_username}"